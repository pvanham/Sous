import Staff from "@/server/models/Staff";
import type { StaffInput } from "@/lib/validations/staff.schema";
import {
  StaffDTO,
  ImportResult,
  StaffListParams,
  PaginatedStaffResult,
  toStaffDTO,
} from "@/types/staff";

/**
 * StaffService - Service layer for Staff operations.
 * This is the ONLY place that imports and interacts with the Staff Mongoose model.
 */
export const StaffService = {
  /**
   * List all staff for a user (includes both active and inactive).
   * @param userId - Clerk user ID (restaurant owner)
   * @returns Array of StaffDTO
   */
  async list(userId: string): Promise<StaffDTO[]> {
    const docs = await Staff.find({ userId }).sort({ name: 1 }).lean();
    return docs.map(toStaffDTO);
  },

  /**
   * List staff with pagination, sorting by last name, and search.
   * @param userId - Clerk user ID (restaurant owner)
   * @param params - Pagination and filter parameters
   * @returns PaginatedStaffResult with staff array and pagination metadata
   */
  async listPaginated(
    userId: string,
    params: StaffListParams
  ): Promise<PaginatedStaffResult> {
    const { page, pageSize, sortOrder, search } = params;
    const skip = (page - 1) * pageSize;

    // Build match filter
    const matchFilter: Record<string, unknown> = { userId };

    // Add search filter if provided
    if (search && search.trim() !== "") {
      const searchRegex = { $regex: search.trim(), $options: "i" };
      matchFilter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
      ];
    }

    // Use aggregation to extract and sort by last name
    const pipeline = [
      { $match: matchFilter },
      // Extract last name (last word in name)
      {
        $addFields: {
          lastName: {
            $toLower: {
              $arrayElemAt: [{ $split: ["$name", " "] }, -1],
            },
          },
        },
      },
      // Sort by lastName
      { $sort: { lastName: sortOrder === "asc" ? 1 : -1 } as Record<string, 1 | -1> },
      // Facet for pagination and total count
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: pageSize }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await Staff.aggregate(pipeline);

    const data = result[0]?.data || [];
    const total = result[0]?.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(total / pageSize);

    return {
      staff: data.map(toStaffDTO),
      total,
      page,
      pageSize,
      totalPages,
    };
  },

  /**
   * Get a single staff member by ID.
   * @param userId - Clerk user ID (ownership check)
   * @param staffId - Staff document ID
   * @returns StaffDTO or null if not found
   */
  async getById(userId: string, staffId: string): Promise<StaffDTO | null> {
    const doc = await Staff.findOne({ _id: staffId, userId }).lean();
    if (!doc) return null;
    return toStaffDTO(doc);
  },

  /**
   * Create a new staff member.
   * @param userId - Clerk user ID (restaurant owner)
   * @param data - Validated staff input
   * @returns Created StaffDTO
   */
  async create(
    userId: string,
    data: Omit<StaffInput, "isActive"> & { isActive?: boolean }
  ): Promise<StaffDTO> {
    const doc = await Staff.create({
      userId,
      name: data.name,
      email: data.email.toLowerCase(),
      phone: data.phone,
      roles: data.roles,
      skills: data.skills || [],
      isActive: data.isActive ?? true,
    });

    return toStaffDTO(doc.toObject());
  },

  /**
   * Update an existing staff member.
   * @param userId - Clerk user ID (ownership check)
   * @param staffId - Staff document ID
   * @param data - Partial staff data to update
   * @returns Updated StaffDTO or null if not found
   */
  async update(
    userId: string,
    staffId: string,
    data: Partial<StaffInput>
  ): Promise<StaffDTO | null> {
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email.toLowerCase();
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.roles !== undefined) updateData.roles = data.roles;
    if (data.skills !== undefined) updateData.skills = data.skills;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const doc = await Staff.findOneAndUpdate(
      { _id: staffId, userId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return null;
    return toStaffDTO(doc);
  },

  /**
   * Bulk upsert staff for CSV import.
   * Matches by email to determine insert vs update.
   * @param userId - Clerk user ID (restaurant owner)
   * @param staffData - Array of validated staff input
   * @returns ImportResult with counts
   */
  async bulkUpsert(
    userId: string,
    staffData: Array<Omit<StaffInput, "isActive">>
  ): Promise<Omit<ImportResult, "skipped" | "errors">> {
    if (staffData.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    // Get existing staff emails for this user
    const existingEmails = new Set(
      (await Staff.find({ userId }, { email: 1 }).lean()).map((s) => s.email)
    );

    const bulkOps = staffData.map((staff) => {
      const filter = { userId, email: staff.email.toLowerCase() };
      const update = {
        $set: {
          name: staff.name,
          phone: staff.phone,
          roles: staff.roles,
          skills: staff.skills || [],
          isActive: true,
        },
        $setOnInsert: {
          userId,
          email: staff.email.toLowerCase(),
        },
      };

      return {
        updateOne: {
          filter,
          update,
          upsert: true,
        },
      };
    });

    const result = await Staff.bulkWrite(bulkOps);

    // Count inserts vs updates
    const inserted = result.upsertedCount;
    const updated = result.modifiedCount;

    return { inserted, updated };
  },

  /**
   * Set staff active/inactive status (soft delete).
   * @param userId - Clerk user ID (ownership check)
   * @param staffId - Staff document ID
   * @param isActive - New active status
   * @returns Updated StaffDTO or null if not found
   */
  async setActive(
    userId: string,
    staffId: string,
    isActive: boolean
  ): Promise<StaffDTO | null> {
    const doc = await Staff.findOneAndUpdate(
      { _id: staffId, userId },
      { $set: { isActive } },
      { new: true }
    ).lean();

    if (!doc) return null;
    return toStaffDTO(doc);
  },

  /**
   * Permanently delete a single staff member.
   * @param userId - Clerk user ID (ownership check)
   * @param staffId - Staff document ID
   * @returns true if deleted, false if not found
   */
  async delete(userId: string, staffId: string): Promise<boolean> {
    const result = await Staff.deleteOne({ _id: staffId, userId });
    return result.deletedCount > 0;
  },

  /**
   * Delete all staff for a user (for testing/cleanup).
   * @param userId - Clerk user ID
   * @returns Number of deleted documents
   */
  async deleteAllByUserId(userId: string): Promise<number> {
    const result = await Staff.deleteMany({ userId });
    return result.deletedCount;
  },
};
