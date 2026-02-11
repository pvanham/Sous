import { Types } from "mongoose";
import TimeOffRequest from "@/server/models/TimeOffRequest";
import type { CreateTimeOffRequestInput } from "@/lib/validations/time-off-request.schema";
import type { TimeOffRequestStatus } from "@/types/time-off-request";
import {
  TimeOffRequestDTO,
  toTimeOffRequestDTO,
} from "@/types/time-off-request";

/**
 * TimeOffRequestService - Service layer for Time-Off Request operations.
 * This is the ONLY place that imports and interacts with the TimeOffRequest Mongoose model.
 *
 * Handles specific date-range time-off requests (vacation, appointments, etc.).
 * Different from StaffAvailability which handles recurring weekly patterns.
 */
export const TimeOffRequestService = {
  /**
   * List all time-off requests for a location.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Array of TimeOffRequestDTO sorted by startDate descending (most recent first)
   */
  async list(
    orgId: string,
    locationId: string
  ): Promise<TimeOffRequestDTO[]> {
    const docs = await TimeOffRequest.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    })
      .sort({ startDate: -1 })
      .lean();
    return docs.map(toTimeOffRequestDTO);
  },

  /**
   * Get a single time-off request by ID.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param id - TimeOffRequest document ID
   * @returns TimeOffRequestDTO or null if not found
   */
  async getById(
    orgId: string,
    locationId: string,
    id: string
  ): Promise<TimeOffRequestDTO | null> {
    const doc = await TimeOffRequest.findOne({
      _id: id,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();
    if (!doc) return null;
    return toTimeOffRequestDTO(doc);
  },

  /**
   * Get all time-off requests for a specific staff member.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param staffId - Staff document ID
   * @returns Array of TimeOffRequestDTO sorted by startDate descending
   */
  async getByStaffId(
    orgId: string,
    locationId: string,
    staffId: string
  ): Promise<TimeOffRequestDTO[]> {
    const docs = await TimeOffRequest.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
    })
      .sort({ startDate: -1 })
      .lean();
    return docs.map(toTimeOffRequestDTO);
  },

  /**
   * Get all time-off requests overlapping a date range (any status).
   * Uses overlap logic: doc.startDate <= queryEndDate AND doc.endDate >= queryStartDate
   *
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param startDate - Query range start date
   * @param endDate - Query range end date
   * @returns Array of TimeOffRequestDTO overlapping the range
   */
  async getByDateRange(
    orgId: string,
    locationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<TimeOffRequestDTO[]> {
    const docs = await TimeOffRequest.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      // Overlap condition: request starts before query ends AND request ends after query starts
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    })
      .sort({ startDate: -1 })
      .lean();
    return docs.map(toTimeOffRequestDTO);
  },

  /**
   * Get approved time-off requests for a staff member overlapping a date range.
   * This is a KEY METHOD used by CandidateService (Sprint 3.5) to exclude staff
   * from shift assignments on dates they have approved time off.
   *
   * Uses overlap logic: doc.startDate <= queryEndDate AND doc.endDate >= queryStartDate
   *
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param staffId - Staff document ID
   * @param startDate - Query range start date
   * @param endDate - Query range end date
   * @returns Array of approved TimeOffRequestDTO overlapping the range
   */
  async getApprovedTimeOff(
    orgId: string,
    locationId: string,
    staffId: string,
    startDate: Date,
    endDate: Date
  ): Promise<TimeOffRequestDTO[]> {
    const docs = await TimeOffRequest.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
      status: "approved",
      // Overlap condition: request starts before query ends AND request ends after query starts
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    })
      .sort({ startDate: -1 })
      .lean();
    return docs.map(toTimeOffRequestDTO);
  },

  /**
   * Check if a staff member has any approved time off on a single date.
   * Convenience method wrapping getApprovedTimeOff for single-date checks.
   *
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param staffId - Staff document ID
   * @param date - The date to check
   * @returns true if staff has approved time off on the given date
   */
  async hasApprovedTimeOff(
    orgId: string,
    locationId: string,
    staffId: string,
    date: Date
  ): Promise<boolean> {
    const count = await TimeOffRequest.countDocuments({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
      status: "approved",
      startDate: { $lte: date },
      endDate: { $gte: date },
    });
    return count > 0;
  },

  /**
   * Create a new time-off request with status 'pending'.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param data - Validated create input (staffId, startDate, endDate, reason)
   * @returns Created TimeOffRequestDTO
   */
  async create(
    orgId: string,
    locationId: string,
    data: CreateTimeOffRequestInput
  ): Promise<TimeOffRequestDTO> {
    const doc = await TimeOffRequest.create({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(data.staffId),
      startDate: data.startDate,
      endDate: data.endDate,
      reason: data.reason ?? "",
      status: "pending",
      notes: "",
    });

    return toTimeOffRequestDTO(doc.toObject());
  },

  /**
   * Update the status of a time-off request (approve or deny).
   * Sets reviewedAt to now and reviewedBy to the approver's Clerk userId.
   *
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param requestId - TimeOffRequest document ID
   * @param status - New status ('approved' or 'denied')
   * @param reviewedBy - Clerk userId of the manager approving/denying
   * @param notes - Optional manager note
   * @returns Updated TimeOffRequestDTO or null if not found
   */
  async updateStatus(
    orgId: string,
    locationId: string,
    requestId: string,
    status: TimeOffRequestStatus,
    reviewedBy: string,
    notes?: string
  ): Promise<TimeOffRequestDTO | null> {
    const updateData: Record<string, unknown> = {
      status,
      reviewedAt: new Date(),
      reviewedBy,
    };

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const doc = await TimeOffRequest.findOneAndUpdate(
      {
        _id: requestId,
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return null;
    return toTimeOffRequestDTO(doc);
  },

  /**
   * Delete a time-off request. Only allows deletion of pending requests
   * to preserve audit trails for approved/denied requests.
   *
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param id - TimeOffRequest document ID
   * @returns true if deleted, false if not found or not pending
   */
  async delete(
    orgId: string,
    locationId: string,
    id: string
  ): Promise<boolean> {
    const result = await TimeOffRequest.deleteOne({
      _id: id,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      status: "pending", // Only allow deletion of pending requests
    });
    return result.deletedCount > 0;
  },

  /**
   * Delete all time-off requests for a location (for testing/cleanup).
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Number of deleted documents
   */
  async deleteAllByLocation(
    orgId: string,
    locationId: string
  ): Promise<number> {
    const result = await TimeOffRequest.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount;
  },

  /**
   * Delete all time-off requests for an organization (for testing/cleanup).
   * @param orgId - Organization ID
   * @returns Number of deleted documents
   */
  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await TimeOffRequest.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },
};
