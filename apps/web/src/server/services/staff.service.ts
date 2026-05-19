import { Types } from "mongoose";
import Staff from "@/server/models/Staff";
import type { StaffInput } from "@/lib/validations/staff.schema";
import {
  StaffDTO,
  InvitationStatus,
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
   * List all staff for a location (includes both active and inactive).
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Array of StaffDTO
   */
  async list(orgId: string, locationId: string): Promise<StaffDTO[]> {
    const docs = await Staff.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    })
      .sort({ name: 1 })
      .lean();
    return docs.map(toStaffDTO);
  },

  /**
   * List staff with pagination, sorting by last name, and search.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param params - Pagination and filter parameters
   * @returns PaginatedStaffResult with staff array and pagination metadata
   */
  async listPaginated(
    orgId: string,
    locationId: string,
    params: StaffListParams
  ): Promise<PaginatedStaffResult> {
    const { page, pageSize, sortOrder, search } = params;
    const skip = (page - 1) * pageSize;

    // Build match filter
    const matchFilter: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    };

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
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param staffId - Staff document ID
   * @returns StaffDTO or null if not found
   */
  async getById(
    orgId: string,
    locationId: string,
    staffId: string
  ): Promise<StaffDTO | null> {
    const doc = await Staff.findOne({
      _id: staffId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();
    if (!doc) return null;
    return toStaffDTO(doc);
  },

  /**
   * Bulk-fetch staff records by ID for a tenant.
   *
   * Used by the mobile shift-roster route to materialize a
   * collection of `staffId`s (returned by
   * `ShiftService.getRosterByOverlap`) into full `StaffDTO`s in a
   * single round-trip rather than one `getById` per staff member.
   *
   * Invalid / non-`ObjectId` strings are filtered out silently so a
   * single bad input doesn't crash the whole query. Results are
   * deduplicated to match the deduplicated input set, and ordered by
   * `name` ascending for stable presentation in the UI.
   *
   * @param orgId       Organization ID (tenancy filter).
   * @param locationId  Location ID (tenancy filter).
   * @param staffIds    Staff document IDs to fetch.
   * @returns Array of StaffDTOs (may be shorter than input if some
   *          IDs don't exist in this tenant).
   */
  async getByIds(
    orgId: string,
    locationId: string,
    staffIds: string[]
  ): Promise<StaffDTO[]> {
    if (staffIds.length === 0) return [];

    const objectIds = Array.from(new Set(staffIds))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) return [];

    const docs = await Staff.find({
      _id: { $in: objectIds },
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    })
      .sort({ name: 1 })
      .lean();

    return docs.map(toStaffDTO);
  },

  /**
   * Create a new staff member.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param data - Validated staff input
   * @returns Created StaffDTO
   */
  async create(
    orgId: string,
    locationId: string,
    data: Omit<StaffInput, "isActive"> & { isActive?: boolean; invitationStatus?: InvitationStatus }
  ): Promise<StaffDTO> {
    // Cast skills to match Mongoose schema expectations
    const skills = (data.skills || []).map((s) => ({
      station: s.station,
      proficiency: s.proficiency as 1 | 2 | 3 | 4 | 5,
    }));

    const doc = await Staff.create({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      name: data.name,
      email: data.email.toLowerCase(),
      phone: data.phone,
      roles: data.roles,
      skills,
      isActive: data.isActive ?? true,
      invitationStatus: data.invitationStatus ?? "not_invited",
      // Phase 3: Staff constraints for AI scheduling
      maxHoursPerWeek: data.maxHoursPerWeek ?? 40,
      minHoursPerWeek: data.minHoursPerWeek ?? 0,
      preferredStations: data.preferredStations ?? [],
      certifications: data.certifications ?? [],
      hourlyRate: data.hourlyRate ?? 0,
    });

    return toStaffDTO(doc.toObject());
  },

  /**
   * Update an existing staff member.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param staffId - Staff document ID
   * @param data - Partial staff data to update
   * @returns Updated StaffDTO or null if not found
   */
  async update(
    orgId: string,
    locationId: string,
    staffId: string,
    data: Partial<StaffInput>
  ): Promise<StaffDTO | null> {
    const updateData: Record<string, unknown> = {};
    const unsetData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email.toLowerCase();
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.roles !== undefined) updateData.roles = data.roles;
    if (data.skills !== undefined) updateData.skills = data.skills;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    // Phase 3: Staff constraints for AI scheduling
    if (data.maxHoursPerWeek !== undefined)
      updateData.maxHoursPerWeek = data.maxHoursPerWeek;
    if (data.minHoursPerWeek !== undefined)
      updateData.minHoursPerWeek = data.minHoursPerWeek;
    if (data.preferredStations !== undefined)
      updateData.preferredStations = data.preferredStations;
    if (data.certifications !== undefined)
      updateData.certifications = data.certifications;
    if (data.hourlyRate !== undefined) updateData.hourlyRate = data.hourlyRate;
    // Address: `null` clears the field entirely ($unset), a present
    // object replaces it. Leaving `address` undefined keeps whatever
    // is already on the document.
    if (data.address === null) {
      unsetData.address = "";
    } else if (data.address !== undefined) {
      updateData.address = data.address;
    }

    const mutation: Record<string, unknown> = {};
    if (Object.keys(updateData).length > 0) mutation.$set = updateData;
    if (Object.keys(unsetData).length > 0) mutation.$unset = unsetData;

    const doc = await Staff.findOneAndUpdate(
      {
        _id: staffId,
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      },
      mutation,
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return null;
    return toStaffDTO(doc);
  },

  /**
   * Bulk upsert staff for CSV import.
   * Matches by email to determine insert vs update.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param staffData - Array of validated staff input
   * @returns ImportResult with counts
   */
  async bulkUpsert(
    orgId: string,
    locationId: string,
    staffData: Array<Omit<StaffInput, "isActive">>
  ): Promise<Omit<ImportResult, "skipped" | "errors">> {
    if (staffData.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    const orgObjectId = new Types.ObjectId(orgId);
    const locationObjectId = new Types.ObjectId(locationId);

    const bulkOps = staffData.map((staff) => {
      // Cast skills to match Mongoose schema expectations
      const skills = (staff.skills || []).map((s) => ({
        station: s.station,
        proficiency: s.proficiency as 1 | 2 | 3 | 4 | 5,
      }));

      const filter = {
        orgId: orgObjectId,
        locationId: locationObjectId,
        email: staff.email.toLowerCase(),
      };
      const update = {
        $set: {
          name: staff.name,
          phone: staff.phone,
          roles: staff.roles,
          skills,
          isActive: true,
          // Phase 3: Staff constraints for AI scheduling
          maxHoursPerWeek: staff.maxHoursPerWeek ?? 40,
          minHoursPerWeek: staff.minHoursPerWeek ?? 0,
          preferredStations: staff.preferredStations ?? [],
          certifications: staff.certifications ?? [],
          hourlyRate: staff.hourlyRate ?? 0,
        },
        $setOnInsert: {
          orgId: orgObjectId,
          locationId: locationObjectId,
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
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param staffId - Staff document ID
   * @param isActive - New active status
   * @returns Updated StaffDTO or null if not found
   */
  async setActive(
    orgId: string,
    locationId: string,
    staffId: string,
    isActive: boolean
  ): Promise<StaffDTO | null> {
    const doc = await Staff.findOneAndUpdate(
      {
        _id: staffId,
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      },
      { $set: { isActive } },
      { new: true }
    ).lean();

    if (!doc) return null;
    return toStaffDTO(doc);
  },

  /**
   * Permanently delete a single staff member.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param staffId - Staff document ID
   * @returns true if deleted, false if not found
   */
  async delete(
    orgId: string,
    locationId: string,
    staffId: string
  ): Promise<boolean> {
    const result = await Staff.deleteOne({
      _id: staffId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount > 0;
  },

  /**
   * Delete all staff for a location (for testing/cleanup).
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Number of deleted documents
   */
  async deleteAllByLocation(orgId: string, locationId: string): Promise<number> {
    const result = await Staff.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount;
  },

  /**
   * Delete all staff for an organization (for testing/cleanup).
   * @param orgId - Organization ID
   * @returns Number of deleted documents
   */
  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await Staff.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },

  // ============================================================
  // Impact Analysis Methods (for station/role removal)
  // ============================================================

  /**
   * Find staff who have skills for the specified stations.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param stations - Array of station names to check
   * @returns Array of StaffDTO who have skills for any of the specified stations
   */
  async findStaffByStations(
    orgId: string,
    locationId: string,
    stations: string[]
  ): Promise<StaffDTO[]> {
    if (stations.length === 0) return [];

    const docs = await Staff.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      "skills.station": { $in: stations },
    })
      .sort({ name: 1 })
      .lean();

    return docs.map(toStaffDTO);
  },

  /**
   * Count staff who have skills for the specified stations.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param stations - Array of station names to check
   * @returns Count of staff with skills for any of the specified stations
   */
  async countByStations(
    orgId: string,
    locationId: string,
    stations: string[]
  ): Promise<number> {
    if (stations.length === 0) return 0;

    return await Staff.countDocuments({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      "skills.station": { $in: stations },
    });
  },

  /**
   * Find staff who have any of the specified roles.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param roles - Array of role names to check
   * @returns Array of StaffDTO who have any of the specified roles
   */
  async findStaffByRoles(
    orgId: string,
    locationId: string,
    roles: string[]
  ): Promise<StaffDTO[]> {
    if (roles.length === 0) return [];

    const docs = await Staff.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      roles: { $in: roles },
    })
      .sort({ name: 1 })
      .lean();

    return docs.map(toStaffDTO);
  },

  /**
   * Find staff who ONLY have the specified roles (would be left with no roles if removed).
   * This is CRITICAL for role removal - these staff members need a replacement role.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param roles - Array of role names being removed
   * @returns Array of StaffDTO who would have no roles left after removal
   */
  async findStaffWithOnlyRoles(
    orgId: string,
    locationId: string,
    roles: string[]
  ): Promise<StaffDTO[]> {
    if (roles.length === 0) return [];

    // Find staff where ALL their roles are in the removal list
    // i.e., staff whose roles array is a subset of the roles being removed
    const docs = await Staff.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      roles: { $in: roles }, // Has at least one of the roles being removed
      $expr: {
        // All of their roles are in the removal list
        $eq: [
          { $size: { $setDifference: ["$roles", roles] } },
          0,
        ],
      },
    })
      .sort({ name: 1 })
      .lean();

    return docs.map(toStaffDTO);
  },

  /**
   * Count staff who have any of the specified roles.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param roles - Array of role names to check
   * @returns Count of staff with any of the specified roles
   */
  async countByRoles(
    orgId: string,
    locationId: string,
    roles: string[]
  ): Promise<number> {
    if (roles.length === 0) return 0;

    return await Staff.countDocuments({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      roles: { $in: roles },
    });
  },

  // ============================================================
  // Cleanup/Replacement Methods (for station/role removal)
  // ============================================================

  /**
   * Remove skills for specified stations from all staff at a location.
   * Used when a station is removed from kitchen config.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param stations - Array of station names to remove from skills
   * @returns Number of staff documents modified
   */
  async removeSkillsByStations(
    orgId: string,
    locationId: string,
    stations: string[]
  ): Promise<number> {
    if (stations.length === 0) return 0;

    const result = await Staff.updateMany(
      {
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
        "skills.station": { $in: stations },
      },
      {
        $pull: { skills: { station: { $in: stations } } },
      }
    );

    return result.modifiedCount;
  },

  /**
   * Count staff who have any of the specified stations in their preferredStations array.
   * Used for impact analysis when removing stations from kitchen config.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param stations - Array of station names to check
   * @returns Count of staff with any of the specified stations in preferredStations
   */
  async countByPreferredStations(
    orgId: string,
    locationId: string,
    stations: string[]
  ): Promise<number> {
    if (stations.length === 0) return 0;

    return await Staff.countDocuments({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      preferredStations: { $in: stations },
    });
  },

  /**
   * Remove specified stations from preferredStations for all staff at a location.
   * Used when a station is removed from kitchen config (cascading cleanup).
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param stations - Array of station names to remove from preferredStations
   * @returns Number of staff documents modified
   */
  async removePreferredStations(
    orgId: string,
    locationId: string,
    stations: string[]
  ): Promise<number> {
    if (stations.length === 0) return 0;

    const result = await Staff.updateMany(
      {
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
        preferredStations: { $in: stations },
      },
      {
        $pull: { preferredStations: { $in: stations } },
      }
    );

    return result.modifiedCount;
  },

  /**
   * Replace a role with another for all staff who have that role.
   * Used when a role is removed and staff need to be reassigned.
   * This handles the case where staff would be left with no roles.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param oldRole - Role name to replace
   * @param newRole - Role name to assign instead
   * @returns Number of staff documents modified
   */
  async replaceRole(
    orgId: string,
    locationId: string,
    oldRole: string,
    newRole: string
  ): Promise<number> {
    // First, add the new role to all staff who have the old role (if they don't already have it)
    // Use $and to properly combine role conditions (duplicate object keys would overwrite each other)
    await Staff.updateMany(
      {
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
        $and: [
          { roles: oldRole },
          { roles: { $ne: newRole } }, // Don't add if they already have the new role
        ],
      },
      {
        $addToSet: { roles: newRole },
      }
    );

    // Then remove the old role from all staff
    const result = await Staff.updateMany(
      {
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
        roles: oldRole,
      },
      {
        $pull: { roles: oldRole },
      }
    );

    return result.modifiedCount;
  },

  /**
   * Remove a role from staff who have other roles (safe removal).
   * Only removes the role if staff have at least one other role.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param role - Role name to remove
   * @returns Number of staff documents modified
   */
  async removeRoleFromStaff(
    orgId: string,
    locationId: string,
    role: string
  ): Promise<number> {
    // Only remove from staff who have more than one role
    const result = await Staff.updateMany(
      {
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
        roles: role,
        $expr: { $gt: [{ $size: "$roles" }, 1] }, // Must have more than 1 role
      },
      {
        $pull: { roles: role },
      }
    );

    return result.modifiedCount;
  },

  // ============================================================
  // Invitation / Clerk Linking Methods
  // ============================================================

  /**
   * Find a staff record by email within a specific org/location.
   * Used by the webhook to link a Clerk user to an existing staff record.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param email - Staff email address
   * @returns StaffDTO or null if not found
   */
  async getByEmail(
    orgId: string,
    locationId: string,
    email: string
  ): Promise<StaffDTO | null> {
    const doc = await Staff.findOne({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      email: email.toLowerCase(),
    }).lean();
    if (!doc) return null;
    return toStaffDTO(doc);
  },

  /**
   * Find the staff record linked to a given Clerk user inside a
   * specific tenant.
   *
   * The mobile route handlers use this to translate the caller's
   * Clerk identity (resolved by `auth()`) into the `staffId` that
   * every shift / time-off / exchange query is keyed on, without
   * trusting any client-supplied id.
   *
   * @returns StaffDTO or null when no staff row at this location is
   *          linked to the given Clerk user.
   */
  async getByClerkUserId(
    orgId: string,
    locationId: string,
    clerkUserId: string
  ): Promise<StaffDTO | null> {
    const doc = await Staff.findOne({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      clerkUserId,
    }).lean();
    if (!doc) return null;
    return toStaffDTO(doc);
  },

  /**
   * Link a Clerk user ID to a staff record and mark the invitation as accepted.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param staffId - Staff document ID
   * @param clerkUserId - Clerk user ID to link
   * @returns Updated StaffDTO or null if not found
   */
  async linkClerkUser(
    orgId: string,
    locationId: string,
    staffId: string,
    clerkUserId: string
  ): Promise<StaffDTO | null> {
    const doc = await Staff.findOneAndUpdate(
      {
        _id: staffId,
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      },
      {
        $set: {
          clerkUserId,
          invitationStatus: "accepted" as InvitationStatus,
        },
      },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return null;
    return toStaffDTO(doc);
  },

  /**
   * Update just the invitation status on a staff record.
   * @param staffId - Staff document ID
   * @param status - New invitation status
   * @returns Updated StaffDTO or null if not found
   */
  async setInvitationStatus(
    staffId: string,
    status: InvitationStatus
  ): Promise<StaffDTO | null> {
    const doc = await Staff.findByIdAndUpdate(
      staffId,
      { $set: { invitationStatus: status } },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return null;
    return toStaffDTO(doc);
  },

  /**
   * Mirror a Clerk-hosted profile image URL onto every Staff row that
   * is linked to the given Clerk user.
   *
   * Pass `null` (typical when the user clears their Clerk avatar) to
   * unset the field — UI consumers fall back to initials. We update
   * across all locations a staff member is associated with so a
   * cross-location list (e.g. owner / shift-lead views) sees a
   * consistent picture.
   *
   * Returns the number of staff documents that were modified. If the
   * caller is a manager / owner without any Staff row at all, this
   * just returns 0 — the caller should still mirror the image onto
   * the OrganizationMember rows for their account.
   */
  async setImageUrlForClerkUser(
    clerkUserId: string,
    imageUrl: string | null,
  ): Promise<number> {
    const result = await Staff.updateMany(
      { clerkUserId },
      { $set: { imageUrl } },
    );
    return result.modifiedCount;
  },

  /**
   * Stamp `onboardingCompletedAt` the first time the staff member
   * finishes the mobile onboarding wizard. Idempotent: re-runs after
   * the field has been set return the existing record unchanged
   * (`$setOnInsert`-style semantics via the `onboardingCompletedAt:
   * null` filter clause).
   *
   * Tenancy is enforced inside the filter so a malicious caller
   * can't flip the flag on a Staff row outside their own
   * org/location even with a forged `staffId`.
   */
  async markOnboardingComplete(
    orgId: string,
    locationId: string,
    staffId: string
  ): Promise<StaffDTO | null> {
    const tenantFilter = {
      _id: staffId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    };

    const updated = await Staff.findOneAndUpdate(
      { ...tenantFilter, onboardingCompletedAt: null },
      { $set: { onboardingCompletedAt: new Date() } },
      { new: true }
    ).lean();

    if (updated) return toStaffDTO(updated);

    // Already completed — return the existing record so the caller
    // still receives the canonical DTO (with the prior timestamp)
    // rather than a misleading `null`.
    const existing = await Staff.findOne(tenantFilter).lean();
    if (!existing) return null;
    return toStaffDTO(existing);
  },

  /**
   * Unlink a Clerk user from a staff record (e.g., when user is deleted).
   * Preserves the staff record for scheduling data but removes the auth link.
   * @param clerkUserId - Clerk user ID to unlink
   * @returns Number of staff documents modified
   */
  async unlinkClerkUser(clerkUserId: string): Promise<number> {
    const result = await Staff.updateMany(
      { clerkUserId },
      {
        $set: {
          clerkUserId: null,
          invitationStatus: "not_invited" as InvitationStatus,
        },
      }
    );
    return result.modifiedCount;
  },
};
