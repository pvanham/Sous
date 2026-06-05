import { Types } from "mongoose";
import SkillChangeRequest from "@/server/models/SkillChangeRequest";
import { StaffService } from "@/server/services/staff.service";
import {
  SkillChangeRequestDTO,
  toSkillChangeRequestDTO,
} from "@/types/skill-change-request";
import type {
  SkillChangeStatus,
  SkillChangeType,
} from "@/types/skill-change-request";

/**
 * Minimal staff identity the submit methods need. Callers resolve the
 * full `StaffDTO` (from the Clerk JWT on mobile) and pass the slice
 * required to denormalise + scope the request.
 */
interface RequestingStaff {
  id: string;
  name: string;
  clerkUserId: string;
  skills: { station: string; proficiency: 1 | 2 | 3 | 4 | 5 }[];
}

/**
 * SkillChangeRequestService — service layer for staff-proposed skill
 * changes. This is the ONLY place that imports the SkillChangeRequest
 * model. Mutations to `Staff.skills` are delegated to `StaffService`
 * so the Staff model stays owned by a single service.
 *
 * Lifecycle: both `add` and `remove` requests start `pending` and do
 * NOT touch `Staff.skills`. A manager approval applies the change; a
 * denial closes the request with no mutation.
 */
export const SkillChangeRequestService = {
  /**
   * List skill change requests for a location, newest first.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param filters - Optional status / staff filters
   */
  async listForLocation(
    orgId: string,
    locationId: string,
    filters?: { status?: SkillChangeStatus; staffId?: string }
  ): Promise<SkillChangeRequestDTO[]> {
    const query: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    };
    if (filters?.status) query.status = filters.status;
    if (filters?.staffId) query.staffId = new Types.ObjectId(filters.staffId);

    const docs = await SkillChangeRequest.find(query)
      .sort({ createdAt: -1 })
      .lean();
    return docs.map(toSkillChangeRequestDTO);
  },

  /**
   * List a single staff member's requests, newest first. Used by the
   * mobile profile to render pending-add / pending-removal chip states.
   */
  async listForStaff(
    orgId: string,
    locationId: string,
    staffId: string,
    status?: SkillChangeStatus
  ): Promise<SkillChangeRequestDTO[]> {
    const query: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
    };
    if (status) query.status = status;

    const docs = await SkillChangeRequest.find(query)
      .sort({ createdAt: -1 })
      .lean();
    return docs.map(toSkillChangeRequestDTO);
  },

  /**
   * Get a single request by ID (tenant scoped).
   */
  async getById(
    orgId: string,
    locationId: string,
    requestId: string
  ): Promise<SkillChangeRequestDTO | null> {
    const doc = await SkillChangeRequest.findOne({
      _id: requestId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();
    if (!doc) return null;
    return toSkillChangeRequestDTO(doc);
  },

  /**
   * Count pending requests per staff member for a location. Backs the
   * "N pending" badges on the manager Staff table.
   * @returns Record keyed by staffId → pending request count
   */
  async countPendingByStaff(
    orgId: string,
    locationId: string
  ): Promise<Record<string, number>> {
    const docs = await SkillChangeRequest.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      status: "pending",
    })
      .select("staffId")
      .lean();

    return docs.reduce<Record<string, number>>((acc, doc) => {
      const key = String(doc.staffId);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  },

  /**
   * Total number of pending requests across a location. Backs the
   * sidebar nav badge.
   */
  async countPendingForLocation(
    orgId: string,
    locationId: string
  ): Promise<number> {
    return SkillChangeRequest.countDocuments({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      status: "pending",
    });
  },

  /**
   * Submit a staff-proposed skill addition. Does not mutate
   * `Staff.skills`; the skill activates only when a manager approves.
   *
   * Station-catalogue validation (against `KitchenConfig.stations`)
   * happens in the route handler, which already loads the config.
   *
   * @throws if the station is already an active skill or already has an
   *         open addition request.
   */
  async submitAddition(
    orgId: string,
    locationId: string,
    staff: RequestingStaff,
    data: { station: string; proficiency: 1 | 2 | 3 | 4 | 5 }
  ): Promise<SkillChangeRequestDTO> {
    const alreadyActive = staff.skills.some(
      (s) => s.station === data.station
    );
    if (alreadyActive) {
      throw new Error("You already have this skill.");
    }

    const existingOpen = await SkillChangeRequest.findOne({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staff.id),
      station: data.station,
      type: "add",
      status: "pending",
    }).lean();
    if (existingOpen) {
      throw new Error("You already have a pending request for this skill.");
    }

    const doc = await SkillChangeRequest.create({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staff.id),
      staffName: staff.name,
      clerkUserId: staff.clerkUserId,
      type: "add" satisfies SkillChangeType,
      station: data.station,
      proficiency: data.proficiency,
      reason: "",
      status: "pending",
      reviewNotes: "",
    });

    return toSkillChangeRequestDTO(doc.toObject());
  },

  /**
   * Submit a staff-proposed skill removal with a reason. Does not
   * mutate `Staff.skills`; the skill stays active until a manager
   * approves the removal.
   *
   * @throws if the staff member does not hold the skill or already has
   *         an open removal request for it.
   */
  async submitRemoval(
    orgId: string,
    locationId: string,
    staff: RequestingStaff,
    data: { station: string; reason: string }
  ): Promise<SkillChangeRequestDTO> {
    const current = staff.skills.find((s) => s.station === data.station);
    if (!current) {
      throw new Error("You do not have this skill.");
    }

    const existingOpen = await SkillChangeRequest.findOne({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staff.id),
      station: data.station,
      type: "remove",
      status: "pending",
    }).lean();
    if (existingOpen) {
      throw new Error(
        "You already have a pending removal request for this skill."
      );
    }

    const doc = await SkillChangeRequest.create({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staff.id),
      staffName: staff.name,
      clerkUserId: staff.clerkUserId,
      type: "remove" satisfies SkillChangeType,
      station: data.station,
      // Snapshot the current proficiency so the manager sees what they
      // are dropping even though the request itself doesn't carry it.
      proficiency: current.proficiency,
      reason: data.reason,
      status: "pending",
      reviewNotes: "",
    });

    return toSkillChangeRequestDTO(doc.toObject());
  },

  /**
   * Apply a manager decision to a single pending request.
   *
   * - approve + add    → activates the skill on `Staff.skills`
   * - approve + remove → drops the skill from `Staff.skills`
   * - deny (either)    → closes the request, no skill mutation
   *
   * Skill mutations are idempotent, so an approval still resolves
   * cleanly if a manager edited the staff member's skills directly in
   * the meantime.
   *
   * @returns Updated request DTO, or null if not found / not pending.
   */
  async review(
    orgId: string,
    locationId: string,
    requestId: string,
    decision: "approve" | "deny",
    reviewedBy: string,
    notes?: string
  ): Promise<SkillChangeRequestDTO | null> {
    const request = await SkillChangeRequest.findOne({
      _id: requestId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      status: "pending",
    });
    if (!request) return null;

    if (decision === "approve") {
      if (request.type === "add") {
        await StaffService.addSkill(orgId, locationId, String(request.staffId), {
          station: request.station,
          proficiency: request.proficiency as 1 | 2 | 3 | 4 | 5,
        });
      } else {
        await StaffService.removeSkill(
          orgId,
          locationId,
          String(request.staffId),
          request.station
        );
      }
    }

    request.status = decision === "approve" ? "approved" : "denied";
    request.reviewedAt = new Date();
    request.reviewedBy = reviewedBy;
    if (notes !== undefined) request.reviewNotes = notes;
    await request.save();

    return toSkillChangeRequestDTO(request.toObject());
  },

  /**
   * Apply one decision to every pending request belonging to a staff
   * member. Backs the "Approve all" / "Deny all" action used to clear
   * an onboarding batch in a single click.
   *
   * @returns The number of requests resolved.
   */
  async reviewBatch(
    orgId: string,
    locationId: string,
    staffId: string,
    decision: "approve" | "deny",
    reviewedBy: string,
    notes?: string
  ): Promise<number> {
    const requests = await SkillChangeRequest.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
      status: "pending",
    });

    let resolved = 0;
    for (const request of requests) {
      const updated = await this.review(
        orgId,
        locationId,
        String(request._id),
        decision,
        reviewedBy,
        notes
      );
      if (updated) resolved += 1;
    }
    return resolved;
  },

  /**
   * Pending station names for a staff member, split by direction. Used
   * by the mobile profile to render "pending approval" (add) and
   * "pending removal" chip states.
   */
  async getPendingStations(
    orgId: string,
    locationId: string,
    staffId: string
  ): Promise<{ pendingAdd: string[]; pendingRemoval: string[] }> {
    const docs = await SkillChangeRequest.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
      status: "pending",
    })
      .select("station type")
      .lean();

    const pendingAdd: string[] = [];
    const pendingRemoval: string[] = [];
    for (const doc of docs) {
      if (doc.type === "add") pendingAdd.push(doc.station);
      else pendingRemoval.push(doc.station);
    }
    return { pendingAdd, pendingRemoval };
  },

  /**
   * Reconcile open requests after a manager edits a staff member's
   * skills directly (via the existing Staff form). Auto-closes requests
   * the manager already satisfied so they don't linger in the queue:
   *
   * - a pending `add` whose station is now present is marked approved
   * - a pending `remove` whose station is now gone is marked approved
   *
   * @param activeStations - Station names the staff member now holds
   * @returns Number of requests auto-resolved
   */
  async reconcileForStaffSkills(
    orgId: string,
    locationId: string,
    staffId: string,
    activeStations: string[],
    reviewedBy: string
  ): Promise<number> {
    const requests = await SkillChangeRequest.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
      status: "pending",
    });

    const active = new Set(activeStations);
    let resolved = 0;
    for (const request of requests) {
      const satisfied =
        (request.type === "add" && active.has(request.station)) ||
        (request.type === "remove" && !active.has(request.station));
      if (!satisfied) continue;

      request.status = "approved";
      request.reviewedAt = new Date();
      request.reviewedBy = reviewedBy;
      request.reviewNotes = "Resolved by a manager skill edit.";
      await request.save();
      resolved += 1;
    }
    return resolved;
  },

  /**
   * Delete all requests for a staff member. Called when a staff member
   * is permanently deleted.
   */
  async deleteByStaffId(
    orgId: string,
    locationId: string,
    staffId: string
  ): Promise<number> {
    const result = await SkillChangeRequest.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
    });
    return result.deletedCount;
  },

  /**
   * Delete all requests for a location (cleanup).
   */
  async deleteAllByLocation(
    orgId: string,
    locationId: string
  ): Promise<number> {
    const result = await SkillChangeRequest.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount;
  },

  /**
   * Delete all requests for an organization (cleanup).
   */
  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await SkillChangeRequest.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },
};
