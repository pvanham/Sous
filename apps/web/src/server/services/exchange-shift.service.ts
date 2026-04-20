import { Types } from "mongoose";
import ExchangeShift from "@/server/models/ExchangeShift";
import Shift from "@/server/models/Shift";
import Staff from "@/server/models/Staff";
import {
  ExchangeShiftDTO,
  toExchangeShiftDTO,
} from "@/types/exchange-shift";

/**
 * Statuses that count as "still on the board". A Shift can only have
 * ONE open exchange entry at a time (enforced by a partial unique
 * index in the model).
 */
const OPEN_STATUSES = ["available", "pending_coverage"] as const;

/**
 * ExchangeShiftService — service layer for the shift-exchange board.
 *
 * Responsibilities:
 *   • Drop a shift onto the board (creates a new ExchangeShift row in
 *     the `available` state, denormalising the Staff name + Shift
 *     start/end/station for cheap rendering on the mobile feed).
 *   • List the board (`available` only, optionally excluding the
 *     caller's own drops) and the caller's own drops.
 *   • Pickup — atomically reassign the underlying Shift's `staffId`
 *     and transition the ExchangeShift to either `covered` (no
 *     approval required) or `pending_coverage` (manager approval
 *     required). Uses optimistic concurrency control on
 *     `ExchangeShift.updatedAt` so two simultaneous pickups can't
 *     both succeed.
 *   • Approve — terminal transition from `pending_coverage` to
 *     `manager_approved`. Records the approver's Clerk user id.
 *   • Cancel — dropper rescinds the drop while still `available`.
 *
 * The route handlers and Server Actions are responsible for RBAC and
 * for resolving the caller's `staffId`. The service trusts whatever
 * IDs it receives; tenancy is enforced on every query.
 *
 * NOTE: This service does NOT perform deep eligibility checks
 * (skill, role, schedule overlap) — those belong in
 * `CandidateService` and the route handler should consult it before
 * calling `pickup`.
 */
export const ExchangeShiftService = {
  /**
   * Get a single ExchangeShift by ID, scoped to the tenant.
   */
  async getById(
    orgId: string,
    locationId: string,
    exchangeId: string
  ): Promise<ExchangeShiftDTO | null> {
    const doc = await ExchangeShift.findOne({
      _id: exchangeId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();
    return doc ? toExchangeShiftDTO(doc) : null;
  },

  /**
   * List shifts that have been dropped and are still pickup-eligible.
   *
   * @param options.excludeStaffId  If provided, hides drops owned by
   *   this staff member. The route handler MUST pass the caller's
   *   resolved staff id so users never see their own drops in the
   *   "available" feed.
   */
  async listAvailable(
    orgId: string,
    locationId: string,
    options: { excludeStaffId?: string; limit?: number } = {}
  ): Promise<ExchangeShiftDTO[]> {
    const { excludeStaffId, limit = 50 } = options;

    const query: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      status: "available",
    };

    if (excludeStaffId) {
      query.staffId = { $ne: new Types.ObjectId(excludeStaffId) };
    }

    const docs = await ExchangeShift.find(query)
      .sort({ start: 1 })
      .limit(limit)
      .lean();

    return docs.map(toExchangeShiftDTO);
  },

  /**
   * List every ExchangeShift the given staff member has dropped, in
   * any status. Used by the mobile "My drops" view so the dropper can
   * see the lifecycle of each request.
   */
  async listByDropper(
    orgId: string,
    locationId: string,
    staffId: string,
    options: { limit?: number } = {}
  ): Promise<ExchangeShiftDTO[]> {
    const { limit = 50 } = options;

    const docs = await ExchangeShift.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return docs.map(toExchangeShiftDTO);
  },

  /**
   * Drop a shift onto the exchange board.
   *
   * Validates that:
   *   • the underlying Shift exists in this tenant,
   *   • the Shift currently belongs to `staffId` (the dropper),
   *   • the Shift is not already on the board with status
   *     `available` or `pending_coverage` (enforced by the partial
   *     unique index, but we surface a clean error here too).
   *
   * Denormalises the Staff name + Shift start/end/station so the
   * board can be rendered without a join.
   */
  async drop(input: {
    orgId: string;
    locationId: string;
    shiftId: string;
    staffId: string;
    reason?: string;
  }): Promise<ExchangeShiftDTO> {
    const { orgId, locationId, shiftId, staffId, reason } = input;

    const shift = await Shift.findOne({
      _id: shiftId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();

    if (!shift) {
      throw new Error("Shift not found");
    }

    if (String(shift.staffId) !== staffId) {
      throw new Error("You can only drop your own shifts");
    }

    const existingOpen = await ExchangeShift.findOne({
      shiftId: new Types.ObjectId(shiftId),
      status: { $in: OPEN_STATUSES },
    }).lean();

    if (existingOpen) {
      throw new Error("This shift is already on the exchange board");
    }

    const dropper = await Staff.findOne({
      _id: staffId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    })
      .select("name")
      .lean();

    if (!dropper) {
      throw new Error("Dropping staff member not found");
    }

    const doc = await ExchangeShift.create({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      shiftId: new Types.ObjectId(shiftId),
      scheduleId: shift.scheduleId,
      staffId: new Types.ObjectId(staffId),
      droppedByName: dropper.name,
      pickedUpByStaffId: null,
      pickedUpByName: null,
      start: shift.start,
      end: shift.end,
      station: shift.station,
      status: "available",
      reason: reason ?? "",
      approvedByClerkUserId: null,
      approvedAt: null,
    });

    return toExchangeShiftDTO(doc.toObject());
  },

  /**
   * Pickup a dropped shift.
   *
   * Steps:
   *   1. Load the ExchangeShift with status `available` (using the
   *      OCC token below to detect concurrent pickups).
   *   2. Reject the caller's own drops.
   *   3. Look up the picker's name (denormalised onto the row).
   *   4. Atomically transition the ExchangeShift via OCC:
   *        filter by `_id` AND `updatedAt` so a stale snapshot
   *        cannot win the race; the action layer surfaces the OCC
   *        miss as HTTP 409.
   *   5. Reassign the underlying `Shift.staffId` to the picker.
   *
   * Without a Mongo transaction these two writes are not atomic.
   * Recovery: if step 5 fails after step 4, the manager-side UI will
   * see a `pending_coverage` (or `covered`) ExchangeShift whose
   * underlying Shift still belongs to the dropper. We leave the
   * cleanup story for the route-handler implementation; in practice
   * this race is rare on a non-replica-set deployment.
   *
   * @param requireApproval  When true, the new status is
   *                         `pending_coverage` and the underlying
   *                         shift is NOT yet reassigned. Approval
   *                         transitions through `approve()`.
   *                         When false, the status moves directly to
   *                         `covered` and the shift is reassigned.
   */
  async pickup(input: {
    orgId: string;
    locationId: string;
    exchangeId: string;
    pickerStaffId: string;
    requireApproval?: boolean;
  }): Promise<ExchangeShiftDTO> {
    const {
      orgId,
      locationId,
      exchangeId,
      pickerStaffId,
      requireApproval = false,
    } = input;

    const existing = await ExchangeShift.findOne({
      _id: exchangeId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      status: "available",
    }).lean();

    if (!existing) {
      // Either it never existed in this tenant, or it's no longer
      // available. The action layer maps this to 404/409 as
      // appropriate.
      throw new Error(
        "Exchange shift is not available for pickup"
      );
    }

    if (String(existing.staffId) === pickerStaffId) {
      throw new Error("You cannot pick up your own dropped shift");
    }

    const picker = await Staff.findOne({
      _id: pickerStaffId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    })
      .select("name")
      .lean();

    if (!picker) {
      throw new Error("Picker staff member not found");
    }

    const nextStatus = requireApproval ? "pending_coverage" : "covered";

    // OCC: filter on the snapshot's `updatedAt` so a competing
    // pickup that landed first invalidates this one.
    //
    // We also flip `aiInsightStatus` to `pending` here so the
    // mobile UI can render a "Sous is thinking…" placeholder
    // immediately. The route handler will kick off the actual
    // generation in an `after()` callback (it is non-blocking
    // because the LLM call can take several seconds).
    const updated = await ExchangeShift.findOneAndUpdate(
      {
        _id: existing._id,
        updatedAt: existing.updatedAt,
        status: "available",
      },
      {
        $set: {
          status: nextStatus,
          pickedUpByStaffId: new Types.ObjectId(pickerStaffId),
          pickedUpByName: picker.name,
          aiInsightStatus: "pending",
          aiInsight: null,
          aiInsightGeneratedAt: null,
        },
      },
      { new: true }
    ).lean();

    if (!updated) {
      throw new Error(
        "Exchange shift was modified by someone else; please refresh"
      );
    }

    if (!requireApproval) {
      // Reassign the underlying Shift to the picker. We deliberately
      // do NOT call `ShiftService.checkOverlap` here — the route
      // handler is expected to consult `CandidateService` for that
      // (the Service tier intentionally stays narrow).
      await Shift.updateOne(
        { _id: updated.shiftId },
        { $set: { staffId: new Types.ObjectId(pickerStaffId) } }
      );
    }

    return toExchangeShiftDTO(updated);
  },

  /**
   * Manager / shift-lead approval of a `pending_coverage` exchange.
   *
   * Reassigns the underlying Shift (if it has not already happened
   * during pickup), records the approver, and transitions the
   * status to `manager_approved`.
   */
  async approve(input: {
    orgId: string;
    locationId: string;
    exchangeId: string;
    approverClerkUserId: string;
  }): Promise<ExchangeShiftDTO> {
    const { orgId, locationId, exchangeId, approverClerkUserId } = input;

    const existing = await ExchangeShift.findOne({
      _id: exchangeId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      status: "pending_coverage",
    }).lean();

    if (!existing) {
      throw new Error(
        "Exchange shift is not awaiting approval"
      );
    }

    if (!existing.pickedUpByStaffId) {
      throw new Error(
        "Cannot approve an exchange that has not been picked up"
      );
    }

    const updated = await ExchangeShift.findOneAndUpdate(
      {
        _id: existing._id,
        updatedAt: existing.updatedAt,
        status: "pending_coverage",
      },
      {
        $set: {
          status: "manager_approved",
          approvedByClerkUserId: approverClerkUserId,
          approvedAt: new Date(),
        },
      },
      { new: true }
    ).lean();

    if (!updated) {
      throw new Error(
        "Exchange shift was modified by someone else; please refresh"
      );
    }

    await Shift.updateOne(
      { _id: updated.shiftId },
      { $set: { staffId: updated.pickedUpByStaffId } }
    );

    return toExchangeShiftDTO(updated);
  },

  /**
   * Dropper rescinds a still-`available` drop. The exchange row is
   * not deleted (we keep an audit trail) but transitions to
   * `cancelled`, which frees the underlying Shift to be dropped
   * again later (the partial unique index excludes this status).
   */
  async cancel(input: {
    orgId: string;
    locationId: string;
    exchangeId: string;
    cancellerStaffId: string;
  }): Promise<ExchangeShiftDTO> {
    const { orgId, locationId, exchangeId, cancellerStaffId } = input;

    const existing = await ExchangeShift.findOne({
      _id: exchangeId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      status: "available",
    }).lean();

    if (!existing) {
      throw new Error(
        "Only available drops can be cancelled"
      );
    }

    if (String(existing.staffId) !== cancellerStaffId) {
      throw new Error(
        "You can only cancel your own drops"
      );
    }

    const updated = await ExchangeShift.findOneAndUpdate(
      {
        _id: existing._id,
        updatedAt: existing.updatedAt,
        status: "available",
      },
      { $set: { status: "cancelled" } },
      { new: true }
    ).lean();

    if (!updated) {
      throw new Error(
        "Exchange shift was modified by someone else; please refresh"
      );
    }

    return toExchangeShiftDTO(updated);
  },

  /**
   * Persist the AI-generated insight onto an ExchangeShift row.
   *
   * Called from the post-pickup `after()` hook once the LLM has
   * returned a concise note about the swap. Tenant-scoped so a
   * caller cannot stamp insights onto another org's rows.
   *
   * @param outcome  `"ready"` when `insight` is a non-empty string
   *                 the user should see; `"failed"` when the LLM
   *                 call errored or produced unsafe / empty output
   *                 (in which case `insight` MUST be null).
   */
  async setAIInsight(input: {
    orgId: string;
    locationId: string;
    exchangeId: string;
    outcome: "ready" | "failed";
    insight: string | null;
  }): Promise<ExchangeShiftDTO | null> {
    const { orgId, locationId, exchangeId, outcome, insight } = input;

    if (outcome === "ready" && (insight === null || insight.trim() === "")) {
      throw new Error("Cannot persist a 'ready' insight with empty text");
    }

    const updated = await ExchangeShift.findOneAndUpdate(
      {
        _id: exchangeId,
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      },
      {
        $set: {
          aiInsightStatus: outcome,
          aiInsight: outcome === "ready" ? insight : null,
          aiInsightGeneratedAt: new Date(),
        },
      },
      { new: true }
    ).lean();

    return updated ? toExchangeShiftDTO(updated) : null;
  },

  /**
   * Test/cleanup helper — drop every exchange row for a location.
   */
  async deleteAllByLocation(
    orgId: string,
    locationId: string
  ): Promise<number> {
    const result = await ExchangeShift.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount;
  },

  /**
   * Test/cleanup helper — drop every exchange row in an org.
   */
  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await ExchangeShift.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },
};
