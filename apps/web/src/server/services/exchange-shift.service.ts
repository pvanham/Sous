import { Types } from "mongoose";
import ExchangeShift from "@/server/models/ExchangeShift";
import Shift from "@/server/models/Shift";
import Staff from "@/server/models/Staff";
import {
  ExchangeShiftDTO,
  toExchangeShiftDTO,
} from "@/types/exchange-shift";
import type {
  ExchangeShiftStatus,
  ExchangeShiftViabilityDTO,
} from "@sous/types";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { NotificationEvents } from "@/server/services/notification-events";
import {
  getWeekStart,
  getWeekEnd,
  calculateShiftDuration,
} from "@/lib/utils/date";

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
   * List every ExchangeShift the given staff member has picked up,
   * in any status. Used by the mobile "My Pickups" view so the
   * picker can track pending / approved / denied submissions after
   * tapping "Pick Up".
   */
  async listByPicker(
    orgId: string,
    locationId: string,
    pickerStaffId: string,
    options: { limit?: number } = {}
  ): Promise<ExchangeShiftDTO[]> {
    const { limit = 50 } = options;

    const docs = await ExchangeShift.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      pickedUpByStaffId: new Types.ObjectId(pickerStaffId),
    })
      .sort({ updatedAt: -1 })
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

    const dto = toExchangeShiftDTO(doc.toObject());
    void NotificationEvents.exchangeNewDrop({
      exchange: dto,
      orgId,
      locationId,
    });
    return dto;
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
        },
      },
      { returnDocument: "after" }
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

    const dto = toExchangeShiftDTO(updated);
    if (requireApproval) {
      void NotificationEvents.exchangePendingApproval({
        exchange: dto,
        orgId,
        locationId,
      });
    } else {
      // Auto-cover branch: notify both counterparties that the swap is done.
      void (async () => {
        const ids =
          await ExchangeShiftService._resolveCounterpartyClerkIds(
            dto,
            orgId,
            locationId,
          );
        const recipients = [
          ids.dropperClerkUserId,
          ids.pickerClerkUserId,
        ].filter((v): v is string => Boolean(v));
        if (recipients.length === 0) return;
        await NotificationEvents.exchangeDecision({
          exchange: dto,
          decision: "covered",
          notifyClerkUserIds: recipients,
          orgId,
          locationId,
        });
      })();
    }
    return dto;
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
      { returnDocument: "after" }
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

    const dto = toExchangeShiftDTO(updated);
    void (async () => {
      const ids = await ExchangeShiftService._resolveCounterpartyClerkIds(
        dto,
        orgId,
        locationId,
      );
      const recipients = [ids.dropperClerkUserId, ids.pickerClerkUserId].filter(
        (v): v is string => Boolean(v),
      );
      if (recipients.length === 0) return;
      await NotificationEvents.exchangeDecision({
        exchange: dto,
        decision: "approved",
        notifyClerkUserIds: recipients,
        orgId,
        locationId,
      });
    })();
    return dto;
  },

  /**
   * Manager / shift-lead denial of a `pending_coverage` exchange.
   *
   * Transitions the row to `denied` (terminal). The underlying Shift
   * stays with the original dropper; the picker effectively "gives
   * back" the proposed switch. The dropper may re-drop the shift
   * later — the partial unique index excludes `denied` rows so that
   * is allowed.
   */
  async deny(input: {
    orgId: string;
    locationId: string;
    exchangeId: string;
    deniedByClerkUserId: string;
    notes?: string;
  }): Promise<ExchangeShiftDTO> {
    const { orgId, locationId, exchangeId, deniedByClerkUserId, notes } =
      input;

    const existing = await ExchangeShift.findOne({
      _id: exchangeId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      status: "pending_coverage",
    }).lean();

    if (!existing) {
      throw new Error("Exchange shift is not awaiting approval");
    }

    const updated = await ExchangeShift.findOneAndUpdate(
      {
        _id: existing._id,
        updatedAt: existing.updatedAt,
        status: "pending_coverage",
      },
      {
        $set: {
          status: "denied",
          approvedByClerkUserId: deniedByClerkUserId,
          approvedAt: new Date(),
          managerNotes: notes ?? "",
        },
      },
      { returnDocument: "after" }
    ).lean();

    if (!updated) {
      throw new Error(
        "Exchange shift was modified by someone else; please refresh"
      );
    }

    const dto = toExchangeShiftDTO(updated);
    void (async () => {
      const ids = await ExchangeShiftService._resolveCounterpartyClerkIds(
        dto,
        orgId,
        locationId,
      );
      const recipients = [ids.dropperClerkUserId, ids.pickerClerkUserId].filter(
        (v): v is string => Boolean(v),
      );
      if (recipients.length === 0) return;
      await NotificationEvents.exchangeDecision({
        exchange: dto,
        decision: "denied",
        notifyClerkUserIds: recipients,
        orgId,
        locationId,
      });
    })();
    return dto;
  },

  /**
   * Manager dashboard list — every exchange row at the location,
   * optionally filtered by `status`. Sorted by `updatedAt` desc so
   * the most recent activity surfaces first.
   *
   * Distinct from `listAvailable` (mobile board) and `listByDropper`
   * (mobile "my drops") — neither restricts visibility, since the
   * web UI is for managers/owners/shift_leads.
   */
  async listForManager(
    orgId: string,
    locationId: string,
    options: { status?: ExchangeShiftStatus; limit?: number } = {}
  ): Promise<ExchangeShiftDTO[]> {
    const { status, limit = 200 } = options;

    const query: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    };
    if (status) {
      query.status = status;
    }

    const docs = await ExchangeShift.find(query)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();

    return docs.map(toExchangeShiftDTO);
  },

  /**
   * Compute on-demand viability for a single exchange row.
   *
   * Returns the picker's hours-after-swap, station-skill match, role
   * overlap, schedule overlap, clopen risk (against the kitchen's
   * configured threshold), and overtime risk.
   *
   * `null` if the row is not in the tenant. When the row has not
   * been picked up yet (`status: "available"`), picker-side fields
   * are populated with defensive defaults so the UI can still render
   * a partial card.
   */
  async getViability(
    orgId: string,
    locationId: string,
    exchangeId: string
  ): Promise<ExchangeShiftViabilityDTO | null> {
    const row = await ExchangeShift.findOne({
      _id: exchangeId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();

    if (!row) return null;

    // Pull both staff records (dropper always present, picker may be
    // null on `available` rows).
    const [dropperDoc, pickerDoc, kitchen] = await Promise.all([
      Staff.findOne({
        _id: row.staffId,
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      }).lean(),
      row.pickedUpByStaffId
        ? Staff.findOne({
            _id: row.pickedUpByStaffId,
            orgId: new Types.ObjectId(orgId),
            locationId: new Types.ObjectId(locationId),
          }).lean()
        : Promise.resolve(null),
      KitchenConfigService.getByLocation(orgId, locationId),
    ]);

    const swapStart = new Date(row.start);
    const swapEnd = new Date(row.end);
    const swapDuration = calculateShiftDuration(swapStart, swapEnd);
    // The kitchen config was already fetched above for clopen settings;
    // reuse it for the location's week-start anchor (default Monday).
    const weekStartsOn = kitchen?.weekStartsOn ?? "monday";
    const weekStart = getWeekStart(swapStart, weekStartsOn);
    const weekEnd = getWeekEnd(swapStart, weekStartsOn);

    const clopenThresholdHours =
      kitchen?.scheduleGenerationSettings?.clopeningWarningThresholdHours ??
      kitchen?.scheduleGenerationSettings?.minHoursBetweenShifts ??
      10;

    // Compute per-staff weekly hours from the shifts collection. The
    // exchange row's underlying shift may already be reassigned to
    // the picker (status `covered` / `manager_approved`) — we still
    // compute "before" / "after" relative to the *original* dropper
    // ownership so the manager sees the impact of the move.
    const weekShiftsForDropper = await Shift.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: row.staffId,
      start: { $gte: weekStart, $lte: weekEnd },
    }).lean();

    const weekShiftsForPicker = pickerDoc
      ? await Shift.find({
          orgId: new Types.ObjectId(orgId),
          locationId: new Types.ObjectId(locationId),
          staffId: pickerDoc._id,
          start: { $gte: weekStart, $lte: weekEnd },
        }).lean()
      : [];

    const sumHours = (
      shifts: Array<{ start: Date; end: Date; _id: unknown }>,
      excludeShiftId?: unknown
    ): number =>
      shifts.reduce((acc, s) => {
        if (excludeShiftId && String(s._id) === String(excludeShiftId)) {
          return acc;
        }
        return acc + calculateShiftDuration(new Date(s.start), new Date(s.end));
      }, 0);

    const dropperHasShift = weekShiftsForDropper.some(
      (s) => String(s._id) === String(row.shiftId)
    );
    const pickerHasShift = weekShiftsForPicker.some(
      (s) => String(s._id) === String(row.shiftId)
    );

    // "Before" = world before the swap. We model the swap as
    // dropper losing the row's hours and picker gaining them,
    // regardless of the row's current status. `dropperHasShift`
    // tells us whether the underlying shift currently still belongs
    // to the dropper (it does for `available` and `pending_coverage`
    // rows).
    const dropperHoursBefore = dropperHasShift
      ? sumHours(weekShiftsForDropper)
      : sumHours(weekShiftsForDropper) + swapDuration;
    const dropperHoursAfter = dropperHoursBefore - swapDuration;

    const pickerHoursBefore = pickerHasShift
      ? sumHours(weekShiftsForPicker, row.shiftId)
      : sumHours(weekShiftsForPicker);
    const pickerHoursAfter = pickerHoursBefore + swapDuration;

    // Skill / role checks against the picker (may be absent if the
    // row is still available).
    const pickerStationSkill = pickerDoc
      ? pickerDoc.skills.find((sk) => sk.station === row.station)
      : undefined;
    const pickerHasSkill = Boolean(pickerStationSkill);
    const pickerStationProficiency = pickerStationSkill
      ? pickerStationSkill.proficiency
      : null;

    const dropperRoles = dropperDoc?.roles ?? [];
    const pickerRoles = pickerDoc?.roles ?? [];
    const pickerHasMatchingRole = pickerDoc
      ? pickerRoles.some((r) => dropperRoles.includes(r))
      : false;

    // Overlap: any picker shift other than the swap itself that
    // intersects the swap window.
    const pickerHasOverlap = pickerDoc
      ? weekShiftsForPicker.some((s) => {
          if (String(s._id) === String(row.shiftId)) return false;
          const sStart = new Date(s.start);
          const sEnd = new Date(s.end);
          return sStart < swapEnd && sEnd > swapStart;
        })
      : false;

    // Turnaround: minimum gap (in hours) between the swap window and
    // the picker's nearest other shift on either side.
    let pickerMinTurnaroundHours: number | null = null;
    if (pickerDoc) {
      let smallest = Number.POSITIVE_INFINITY;
      for (const s of weekShiftsForPicker) {
        if (String(s._id) === String(row.shiftId)) continue;
        const sStart = new Date(s.start);
        const sEnd = new Date(s.end);
        if (sEnd <= swapStart) {
          const gap = (swapStart.getTime() - sEnd.getTime()) / 3_600_000;
          if (gap < smallest) smallest = gap;
        } else if (sStart >= swapEnd) {
          const gap = (sStart.getTime() - swapEnd.getTime()) / 3_600_000;
          if (gap < smallest) smallest = gap;
        }
      }
      if (Number.isFinite(smallest)) {
        pickerMinTurnaroundHours = Math.round(smallest * 100) / 100;
      }
    }

    const pickerClopenRisk =
      pickerMinTurnaroundHours !== null &&
      pickerMinTurnaroundHours < clopenThresholdHours;

    const pickerOvertime = pickerDoc
      ? pickerHoursAfter > pickerDoc.maxHoursPerWeek
      : false;

    const pickerOtherShiftsThisWeek = pickerDoc
      ? weekShiftsForPicker.filter(
          (s) => String(s._id) !== String(row.shiftId)
        ).length
      : 0;

    return {
      dropperHoursBefore: Math.round(dropperHoursBefore * 100) / 100,
      dropperHoursAfter: Math.round(dropperHoursAfter * 100) / 100,
      pickerHoursBefore: Math.round(pickerHoursBefore * 100) / 100,
      pickerHoursAfter: Math.round(pickerHoursAfter * 100) / 100,
      dropperMaxHoursPerWeek: dropperDoc?.maxHoursPerWeek ?? 40,
      pickerMaxHoursPerWeek: pickerDoc?.maxHoursPerWeek ?? 40,
      pickerOvertime,
      pickerHasSkill,
      pickerStationProficiency,
      pickerHasMatchingRole,
      pickerRoles,
      dropperRoles,
      pickerHasOverlap,
      pickerMinTurnaroundHours,
      pickerClopenRisk,
      clopenThresholdHours,
      pickerOtherShiftsThisWeek,
      pickerIsActive: pickerDoc?.isActive ?? false,
      dropperIsActive: dropperDoc?.isActive ?? false,
      dropperName: dropperDoc?.name ?? row.droppedByName,
      pickerName: pickerDoc?.name ?? row.pickedUpByName ?? null,
    };
  },

  /**
   * Dropper rescinds a still-open drop (`available` or
   * `pending_coverage`). The exchange row is not deleted (we keep an
   * audit trail) but transitions to `cancelled`, which frees the
   * underlying Shift to be dropped again later (the partial unique
   * index excludes this status).
   *
   * Because `Shift.staffId` stays with the dropper during both
   * `available` and `pending_coverage`, cancelling from either is a
   * safe no-op on the schedule side — we just clear the picker's
   * interest if one existed.
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
      status: { $in: OPEN_STATUSES },
    }).lean();

    if (!existing) {
      throw new Error(
        "Only available or pending drops can be cancelled"
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
        status: { $in: OPEN_STATUSES },
      },
      {
        $set: {
          status: "cancelled",
          pickedUpByStaffId: null,
          pickedUpByName: null,
        },
      },
      { returnDocument: "after" }
    ).lean();

    if (!updated) {
      throw new Error(
        "Exchange shift was modified by someone else; please refresh"
      );
    }

    const dto = toExchangeShiftDTO(updated);
    // Notify the picker (if any) that the drop they were eyeing /
    // pending on has been cancelled. The dropper initiated this so we
    // skip them.
    if (existing.pickedUpByStaffId) {
      void (async () => {
        const dtoForResolution: ExchangeShiftDTO = {
          ...dto,
          pickedUpByStaffId: String(existing.pickedUpByStaffId),
        };
        const ids =
          await ExchangeShiftService._resolveCounterpartyClerkIds(
            dtoForResolution,
            orgId,
            locationId,
          );
        if (!ids.pickerClerkUserId) return;
        await NotificationEvents.exchangeDecision({
          exchange: dto,
          decision: "cancelled",
          notifyClerkUserIds: [ids.pickerClerkUserId],
          orgId,
          locationId,
        });
      })();
    }
    return dto;
  },

  /**
   * Manager-side cancel of a still-open drop. Identical to `cancel`
   * but skips the ownership check; used by the web manager dashboard
   * so a manager can clean up an in-flight drop (either `available`
   * or `pending_coverage`) without impersonating the dropping staff
   * member.
   */
  async cancelAsManager(input: {
    orgId: string;
    locationId: string;
    exchangeId: string;
  }): Promise<ExchangeShiftDTO> {
    const { orgId, locationId, exchangeId } = input;

    const existing = await ExchangeShift.findOne({
      _id: exchangeId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      status: { $in: OPEN_STATUSES },
    }).lean();

    if (!existing) {
      throw new Error(
        "Only available or pending drops can be cancelled"
      );
    }

    const updated = await ExchangeShift.findOneAndUpdate(
      {
        _id: existing._id,
        updatedAt: existing.updatedAt,
        status: { $in: OPEN_STATUSES },
      },
      {
        $set: {
          status: "cancelled",
          pickedUpByStaffId: null,
          pickedUpByName: null,
        },
      },
      { returnDocument: "after" }
    ).lean();

    if (!updated) {
      throw new Error(
        "Exchange shift was modified by someone else; please refresh"
      );
    }

    const dto = toExchangeShiftDTO(updated);
    // Manager cancelled — notify both counterparties (the dropper
    // didn't choose to cancel, and any picker is also affected).
    void (async () => {
      const dtoForResolution: ExchangeShiftDTO = {
        ...dto,
        pickedUpByStaffId: existing.pickedUpByStaffId
          ? String(existing.pickedUpByStaffId)
          : dto.pickedUpByStaffId,
      };
      const ids = await ExchangeShiftService._resolveCounterpartyClerkIds(
        dtoForResolution,
        orgId,
        locationId,
      );
      const recipients = [ids.dropperClerkUserId, ids.pickerClerkUserId].filter(
        (v): v is string => Boolean(v),
      );
      if (recipients.length === 0) return;
      await NotificationEvents.exchangeDecision({
        exchange: dto,
        decision: "cancelled",
        notifyClerkUserIds: recipients,
        orgId,
        locationId,
      });
    })();
    return dto;
  },

  /**
   * Picker rescinds a `pending_coverage` pickup so the drop returns
   * to the `available` pool. The underlying `Shift.staffId` was
   * never reassigned (the approval path leaves that to `approve()`),
   * so withdrawal is a pure exchange-row transition.
   *
   * Auth: caller must be the current `pickedUpByStaffId`. The action
   * / route layer is responsible for resolving that from the Clerk
   * JWT before calling in.
   */
  async withdrawPickup(input: {
    orgId: string;
    locationId: string;
    exchangeId: string;
    pickerStaffId: string;
  }): Promise<ExchangeShiftDTO> {
    const { orgId, locationId, exchangeId, pickerStaffId } = input;

    const existing = await ExchangeShift.findOne({
      _id: exchangeId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      status: "pending_coverage",
    }).lean();

    if (!existing) {
      throw new Error(
        "This pickup is no longer pending — a manager may have already decided"
      );
    }

    if (
      !existing.pickedUpByStaffId ||
      String(existing.pickedUpByStaffId) !== pickerStaffId
    ) {
      throw new Error(
        "You can only withdraw your own pending pickups"
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
          status: "available",
          pickedUpByStaffId: null,
          pickedUpByName: null,
        },
      },
      { returnDocument: "after" }
    ).lean();

    if (!updated) {
      throw new Error(
        "Exchange shift was modified by someone else; please refresh"
      );
    }

    const dto = toExchangeShiftDTO(updated);
    // Picker withdrew — notify the dropper that their pending pickup
    // is gone. The picker initiated, so we skip them.
    void (async () => {
      const ids = await ExchangeShiftService._resolveCounterpartyClerkIds(
        dto,
        orgId,
        locationId,
      );
      if (!ids.dropperClerkUserId) return;
      await NotificationEvents.exchangeDecision({
        exchange: dto,
        decision: "withdrawn",
        notifyClerkUserIds: [ids.dropperClerkUserId],
        orgId,
        locationId,
      });
    })();
    return dto;
  },

  /**
   * Delete all exchange shifts where the given staff member is the dropper or picker.
   * Called when a staff member is permanently deleted.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param staffId - Staff document ID
   * @returns Number of deleted documents
   */
  async deleteByStaffId(
    orgId: string,
    locationId: string,
    staffId: string
  ): Promise<number> {
    const staffOid = new Types.ObjectId(staffId);
    const result = await ExchangeShift.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      $or: [{ staffId: staffOid }, { pickedUpByStaffId: staffOid }],
    });
    return result.deletedCount;
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
   * Internal helper used by lifecycle methods above to fan a
   * notification out to picker / dropper. Resolves staff ids to Clerk
   * user ids via a single round-trip; never throws.
   */
  async _resolveCounterpartyClerkIds(
    exchange: ExchangeShiftDTO,
    orgId: string,
    locationId: string,
  ): Promise<{ dropperClerkUserId: string | null; pickerClerkUserId: string | null }> {
    const staffIds: Types.ObjectId[] = [
      new Types.ObjectId(exchange.staffId),
    ];
    if (exchange.pickedUpByStaffId) {
      staffIds.push(new Types.ObjectId(exchange.pickedUpByStaffId));
    }
    const docs = await Staff.find({
      _id: { $in: staffIds },
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    })
      .select("clerkUserId")
      .lean();

    let dropperClerkUserId: string | null = null;
    let pickerClerkUserId: string | null = null;
    for (const d of docs) {
      const idStr = String(d._id);
      if (idStr === exchange.staffId) {
        dropperClerkUserId = d.clerkUserId ?? null;
      } else if (
        exchange.pickedUpByStaffId &&
        idStr === exchange.pickedUpByStaffId
      ) {
        pickerClerkUserId = d.clerkUserId ?? null;
      }
    }
    return { dropperClerkUserId, pickerClerkUserId };
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
