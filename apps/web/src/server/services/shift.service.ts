import Shift from "@/server/models/Shift";
import Schedule from "@/server/models/Schedule";
import { ShiftDTO, CreateShiftInput, UpdateShiftInput, toShiftDTO } from "@/types/shift";
import { Types } from "mongoose";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Resolve the set of Schedule ids whose `weekStartDate` could plausibly
 * own a shift inside `[weekStart, weekEnd)`, optionally filtered by
 * status. The +/- 7d padding covers the edge case where a shift on a
 * flipped `weekStartsOn` boundary belongs to a Schedule doc whose own
 * `weekStartDate` falls outside the display window. Returned ids are
 * fed into the shift query as `{ scheduleId: { $in: [...] } }` so
 * Mongo can intersect with the existing `(orgId, locationId, start)`
 * index.
 */
async function resolvePublishedScheduleIds(
  orgId: string,
  locationId: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<Types.ObjectId[]> {
  const docs = await Schedule.find(
    {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      status: "PUBLISHED",
      weekStartDate: {
        $gte: new Date(weekStart.getTime() - WEEK_MS),
        $lt: new Date(weekEnd.getTime() + WEEK_MS),
      },
    },
    { _id: 1 },
  ).lean();
  return docs.map((d) => d._id as Types.ObjectId);
}

/**
 * "From now into the future" variant for the next-shift lookup, where
 * we don't know how far ahead the staff member's next shift sits. The
 * 7d lower padding catches a parent Schedule whose `weekStartDate` is
 * earlier in the current week.
 */
async function resolvePublishedScheduleIdsFrom(
  orgId: string,
  locationId: string,
  from: Date,
): Promise<Types.ObjectId[]> {
  const docs = await Schedule.find(
    {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      status: "PUBLISHED",
      weekStartDate: { $gte: new Date(from.getTime() - WEEK_MS) },
    },
    { _id: 1 },
  ).lean();
  return docs.map((d) => d._id as Types.ObjectId);
}

/**
 * ShiftService - Service layer for Shift operations.
 * This is the ONLY place that imports and interacts with the Shift Mongoose model.
 */
export const ShiftService = {
  /**
   * Check if a shift would overlap with existing shifts for a staff member.
   * Two shifts overlap if: (A.start < B.end) AND (A.end > B.start)
   * @param orgId - Organization ID (for filtering)
   * @param locationId - Location ID (for filtering)
   * @param staffId - Staff member ID
   * @param start - Proposed shift start time
   * @param end - Proposed shift end time
   * @param excludeShiftId - Optional shift ID to exclude (for updates)
   * @returns true if overlap exists, false otherwise
   */
  async checkOverlap(
    orgId: string,
    locationId: string,
    staffId: string,
    start: Date,
    end: Date,
    excludeShiftId?: string
  ): Promise<boolean> {
    const query: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
      // Overlap condition: existing.start < new.end AND existing.end > new.start
      start: { $lt: end },
      end: { $gt: start },
    };

    // Exclude the current shift when updating
    if (excludeShiftId) {
      query._id = { $ne: new Types.ObjectId(excludeShiftId) };
    }

    const overlap = await Shift.findOne(query).lean();
    return overlap !== null;
  },

  /**
   * Create a new shift.
   * @param data - Shift creation data
   * @returns Created ShiftDTO
   * @throws Error if shift overlaps with existing shift
   */
  async create(data: CreateShiftInput): Promise<ShiftDTO> {
    // Check for overlap before creating
    const hasOverlap = await this.checkOverlap(
      data.orgId,
      data.locationId,
      data.staffId,
      data.start,
      data.end
    );

    if (hasOverlap) {
      throw new Error("This shift overlaps with an existing shift for this staff member");
    }

    const doc = await Shift.create({
      orgId: new Types.ObjectId(data.orgId),
      locationId: new Types.ObjectId(data.locationId),
      scheduleId: new Types.ObjectId(data.scheduleId),
      staffId: new Types.ObjectId(data.staffId),
      start: data.start,
      end: data.end,
      station: data.station,
      notes: data.notes || "",
    });

    return toShiftDTO(doc.toObject());
  },

  /**
   * Update an existing shift.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param shiftId - Shift document ID
   * @param data - Partial shift data to update
   * @returns Updated ShiftDTO or null if not found
   * @throws Error if updated shift would overlap with existing shift
   */
  async update(
    orgId: string,
    locationId: string,
    shiftId: string,
    data: UpdateShiftInput
  ): Promise<ShiftDTO | null> {
    // First, get the existing shift to check ownership and get current values
    const existing = await Shift.findOne({
      _id: shiftId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();
    if (!existing) return null;

    // Determine the effective start and end times
    const effectiveStart = data.start ?? existing.start;
    const effectiveEnd = data.end ?? existing.end;

    // Check for overlap with the new times (excluding self)
    const hasOverlap = await this.checkOverlap(
      orgId,
      locationId,
      String(existing.staffId),
      effectiveStart,
      effectiveEnd,
      shiftId
    );

    if (hasOverlap) {
      throw new Error("This shift overlaps with an existing shift for this staff member");
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (data.start !== undefined) updateData.start = data.start;
    if (data.end !== undefined) updateData.end = data.end;
    if (data.station !== undefined) updateData.station = data.station;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const doc = await Shift.findOneAndUpdate(
      {
        _id: shiftId,
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return null;
    return toShiftDTO(doc);
  },

  /**
   * Atomically reassign a shift to a different staff member using an OCC filter.
   * The filter embeds the expected `updatedAt` so the update only succeeds if
   * the shift has not been modified since the proposal was created.
   *
   * @returns Updated ShiftDTO, or null if the OCC filter didn't match (stale data).
   */
  async reassignWithOCC(
    occFilter: Record<string, unknown>,
    targetStaffId: string,
    orgId: string,
    locationId: string,
  ): Promise<ShiftDTO | null> {
    const doc = await Shift.findOneAndUpdate(
      {
        ...occFilter,
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      },
      { $set: { staffId: new Types.ObjectId(targetStaffId) } },
      { new: true }
    ).lean();

    return doc ? toShiftDTO(doc) : null;
  },

  /**
   * Delete a shift.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param shiftId - Shift document ID
   * @returns true if deleted, false if not found
   */
  async delete(
    orgId: string,
    locationId: string,
    shiftId: string
  ): Promise<boolean> {
    const result = await Shift.deleteOne({
      _id: shiftId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount > 0;
  },

  /**
   * Get all shifts for a schedule.
   *
   * Write-path internal. Read paths must use
   * `getByLocationAndDateRange` (manager grid / dashboard) or
   * `getByStaffAndWeek` (staff calendar) — those source by date range
   * so legacy shifts on a pre-flip `weekStartsOn` Schedule still appear
   * in the new display window. Adding a new read consumer requires
   * the optical-window pattern from `docs/architecture/01-data-models.md`.
   *
   * @param scheduleId - Schedule document ID
   * @returns Array of ShiftDTOs
   */
  async getBySchedule(scheduleId: string): Promise<ShiftDTO[]> {
    const docs = await Shift.find({
      scheduleId: new Types.ObjectId(scheduleId),
    })
      .sort({ start: 1 })
      .lean();

    return docs.map(toShiftDTO);
  },

  /**
   * Get shifts for a staff member within a date range.
   * @param staffId - Staff member ID
   * @param start - Range start (inclusive)
   * @param end - Range end (inclusive)
   * @returns Array of ShiftDTOs
   */
  async getByStaffAndDateRange(
    staffId: string,
    start: Date,
    end: Date
  ): Promise<ShiftDTO[]> {
    const docs = await Shift.find({
      staffId: new Types.ObjectId(staffId),
      start: { $gte: start },
      end: { $lte: end },
    })
      .sort({ start: 1 })
      .lean();

    return docs.map(toShiftDTO);
  },

  /**
   * Get a staff member's shifts that fall inside a half-open
   * `[weekStart, weekEnd)` window for a specific tenant.
   *
   * Used by the mobile Schedule tab to populate the weekly strip and
   * day-detail list. The window is left-inclusive / right-exclusive so
   * a shift starting exactly at the next week's boundary doesn't show
   * up twice when the user paginates forward.
   *
   * Filtering is on `start` only — a shift that begins inside the
   * window but ends after it (e.g. an overnight close) is intentionally
   * included so the staff member doesn't lose track of it on the day
   * they actually work it.
   *
   * When `opts.publishedOnly` is true, the result is restricted to
   * shifts whose parent Schedule has `status === "PUBLISHED"` so a
   * DRAFT shift never leaks to a staff phone.
   *
   * @param orgId        Organization ID (tenancy filter).
   * @param locationId   Location ID (tenancy filter).
   * @param staffId      Staff member whose shifts to return.
   * @param weekStart    Inclusive lower bound (UTC instant).
   * @param weekEnd      Exclusive upper bound (UTC instant).
   * @param opts         Optional flags. `publishedOnly` gates on
   *                     `Schedule.status === "PUBLISHED"`.
   * @returns Array of ShiftDTOs sorted by `start` ascending.
   */
  async getByStaffAndWeek(
    orgId: string,
    locationId: string,
    staffId: string,
    weekStart: Date,
    weekEnd: Date,
    opts: { publishedOnly?: boolean } = {},
  ): Promise<ShiftDTO[]> {
    const query: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
      start: { $gte: weekStart, $lt: weekEnd },
    };

    if (opts.publishedOnly) {
      const publishedIds = await resolvePublishedScheduleIds(
        orgId,
        locationId,
        weekStart,
        weekEnd,
      );
      if (publishedIds.length === 0) return [];
      query.scheduleId = { $in: publishedIds };
    }

    const docs = await Shift.find(query)
      .sort({ start: 1 })
      .lean();

    return docs.map(toShiftDTO);
  },

  /**
   * Get every shift at a location whose `start` falls in the half-open
   * `[weekStart, weekEnd)` window, regardless of which Schedule document
   * owns it. Backs the schedule grid and dashboard widget, both of
   * which must surface shifts from legacy Schedule docs after a
   * `weekStartsOn` flip: a Wed-anchored display week can contain shifts
   * that still live on a Mon-anchored Schedule from before the change.
   *
   * Filtering is on `start` only — a shift that begins inside the window
   * but ends after it is intentionally included (matches the convention
   * of `getByStaffAndWeek`).
   *
   * @param orgId      Organization ID (tenancy filter).
   * @param locationId Location ID (tenancy filter).
   * @param weekStart  Inclusive lower bound.
   * @param weekEnd    Exclusive upper bound.
   * @returns Array of ShiftDTOs sorted by `start` ascending.
   */
  async getByLocationAndDateRange(
    orgId: string,
    locationId: string,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<ShiftDTO[]> {
    const docs = await Shift.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      start: { $gte: weekStart, $lt: weekEnd },
    })
      .sort({ start: 1 })
      .lean();

    return docs.map(toShiftDTO);
  },

  /**
   * Return every shift at a location whose time window overlaps
   * `[start, end)`. Backs the mobile "who's on with me" roster modal.
   *
   * Two shifts overlap when `existing.start < window.end` and
   * `existing.end > window.start`. This catches:
   *   - shifts that start before and end during the target window
   *   - shifts that start during the target window
   *   - shifts that span the entire window
   *
   * Intentionally NOT scoped by `scheduleId`: after a `weekStartsOn`
   * flip, co-workers on the same Saturday shift can be attached to
   * different Schedule docs, so a roster constrained to one schedule
   * id would hide a real teammate. Date-range overlap is the only
   * stable definition of "on at the same time".
   *
   * When `opts.publishedOnly` is true, the result is gated on the
   * parent Schedule's status so a manager's DRAFT shifts don't reveal
   * future co-worker assignments to a staff phone.
   */
  async getRosterByOverlap(
    orgId: string,
    locationId: string,
    start: Date,
    end: Date,
    opts: { publishedOnly?: boolean } = {},
  ): Promise<ShiftDTO[]> {
    const query: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      start: { $lt: end },
      end: { $gt: start },
    };

    if (opts.publishedOnly) {
      const publishedIds = await resolvePublishedScheduleIds(
        orgId,
        locationId,
        start,
        end,
      );
      if (publishedIds.length === 0) return [];
      query.scheduleId = { $in: publishedIds };
    }

    const docs = await Shift.find(query)
      .sort({ start: 1 })
      .lean();

    return docs.map(toShiftDTO);
  },

  /**
   * Get the soonest upcoming shift for a staff member at a location.
   *
   * "Upcoming" means `start >= now` — a shift that has already started
   * (even if it hasn't ended) is intentionally excluded so the mobile
   * home card always points the user at their next *future* commitment.
   *
   * The query is bounded by both `orgId` and `locationId` so a staff
   * member who somehow exists in two tenants only ever sees the row
   * for the tenant whose context the caller resolved.
   *
   * When `opts.publishedOnly` is true, DRAFT shifts are excluded —
   * the home card on staff phones must never preview unpublished
   * assignments. The published-id pre-fetch uses a generous +/-7d
   * window around "now" so it catches the parent of the next shift
   * even when it's anchored on a pre-flip `weekStartsOn` Schedule.
   *
   * @returns The next ShiftDTO sorted by `start` ascending, or `null`
   *          if the staff member has no upcoming shifts.
   */
  async getNextForStaff(
    orgId: string,
    locationId: string,
    staffId: string,
    opts: { publishedOnly?: boolean } = {},
  ): Promise<ShiftDTO | null> {
    const now = new Date();
    const query: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
      start: { $gte: now },
    };

    if (opts.publishedOnly) {
      const publishedIds = await resolvePublishedScheduleIdsFrom(
        orgId,
        locationId,
        now,
      );
      if (publishedIds.length === 0) return null;
      query.scheduleId = { $in: publishedIds };
    }

    const doc = await Shift.findOne(query)
      .sort({ start: 1 })
      .lean();

    return doc ? toShiftDTO(doc) : null;
  },

  /**
   * Get a single shift by ID.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param shiftId - Shift document ID
   * @returns ShiftDTO or null if not found
   */
  async getById(
    orgId: string,
    locationId: string,
    shiftId: string
  ): Promise<ShiftDTO | null> {
    const doc = await Shift.findOne({
      _id: shiftId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();
    if (!doc) return null;
    return toShiftDTO(doc);
  },

  /**
   * Delete all shifts for a schedule.
   * @param scheduleId - Schedule document ID
   * @returns Number of deleted documents
   */
  async deleteBySchedule(scheduleId: string): Promise<number> {
    const result = await Shift.deleteMany({
      scheduleId: new Types.ObjectId(scheduleId),
    });
    return result.deletedCount;
  },

  /**
   * Delete all shifts for a location (for testing/cleanup).
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Number of deleted documents
   */
  async deleteAllByLocation(orgId: string, locationId: string): Promise<number> {
    const result = await Shift.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount;
  },

  /**
   * Delete all shifts for an organization (for testing/cleanup).
   * @param orgId - Organization ID
   * @returns Number of deleted documents
   */
  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await Shift.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },

  /**
   * Delete all shifts for a specific staff member.
   * Used when a staff member is permanently deleted to cascade the deletion.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param staffId - Staff member ID
   * @returns Number of deleted documents
   */
  async deleteByStaffId(
    orgId: string,
    locationId: string,
    staffId: string
  ): Promise<number> {
    const result = await Shift.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
    });
    return result.deletedCount;
  },

  /**
   * Count shifts that reference specific stations.
   * Used for informational purposes when removing stations from kitchen config.
   * Historical shifts are NOT modified - this is just to inform the user.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param stations - Array of station names to count
   * @returns Number of shifts referencing any of the specified stations
   */
  async countByStations(
    orgId: string,
    locationId: string,
    stations: string[]
  ): Promise<number> {
    if (stations.length === 0) return 0;

    return await Shift.countDocuments({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      station: { $in: stations },
    });
  },

  /**
   * Bulk create shifts from AI-generated schedule.
   * Creates each shift individually with overlap checks. Shifts that would
   * overlap with existing shifts are skipped rather than failing the whole batch.
   *
   * @param shifts - Array of CreateShiftInput objects
   * @returns Object with count of created and failed shifts, plus any error details
   */
  async bulkCreate(
    shifts: CreateShiftInput[]
  ): Promise<{ created: number; failed: number; errors: Array<{ index: number; staffId: string; message: string }> }> {
    let created = 0;
    let failed = 0;
    const errors: Array<{ index: number; staffId: string; message: string }> = [];

    for (let i = 0; i < shifts.length; i++) {
      const shiftData = shifts[i];
      try {
        await this.create(shiftData);
        created++;
      } catch (error) {
        failed++;
        errors.push({
          index: i,
          staffId: shiftData.staffId,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return { created, failed, errors };
  },

  /**
   * Copy shifts from a source week into a target Schedule, sourcing by
   * **date range** (not by `scheduleId`) so the copy survives a
   * per-location `weekStartsOn` flip.
   *
   * Why date-range: after an owner changes `weekStartsOn` from Monday to
   * Wednesday, the previous Wed-Tue window contains shifts that still
   * live on a legacy Mon-anchored Schedule doc. Sourcing by source
   * Schedule id (the old contract) would return that doc's shifts
   * either zero (if a fresh Wed doc was auto-created at the source
   * week) or the wrong week (if the Mon doc was used). Sourcing by
   * `[sourceWeekStart, sourceWeekStart + 7d)` always returns the
   * shifts the user actually sees on that week, regardless of which
   * Schedule doc owns them.
   *
   * Overlap behaviour is unchanged — a per-staff overlap check skips
   * the copy when the target day already has a shift for that staff.
   *
   * @param orgId             Organization ID (tenancy filter).
   * @param locationId        Location ID (tenancy filter).
   * @param sourceWeekStart   Inclusive lower bound of the source window.
   * @param targetScheduleId  Schedule doc to attach newly-created shifts to.
   * @param targetWeekStart   Inclusive lower bound of the destination
   *                          window. Offset is `targetWeekStart - sourceWeekStart`.
   * @returns Object with `created` and `skipped` counts.
   */
  async copyShiftsAcrossWeeks(
    orgId: string,
    locationId: string,
    sourceWeekStart: Date,
    targetScheduleId: string,
    targetWeekStart: Date,
  ): Promise<{ created: number; skipped: number }> {
    const sourceWeekEnd = new Date(sourceWeekStart.getTime() + WEEK_MS);
    const sourceShifts = await this.getByLocationAndDateRange(
      orgId,
      locationId,
      sourceWeekStart,
      sourceWeekEnd,
    );

    const dayOffsetMs =
      targetWeekStart.getTime() - sourceWeekStart.getTime();

    let created = 0;
    let skipped = 0;

    for (const sourceShift of sourceShifts) {
      const newStart = new Date(
        new Date(sourceShift.start).getTime() + dayOffsetMs,
      );
      const newEnd = new Date(
        new Date(sourceShift.end).getTime() + dayOffsetMs,
      );

      const hasOverlap = await this.checkOverlap(
        orgId,
        locationId,
        sourceShift.staffId,
        newStart,
        newEnd,
      );

      if (hasOverlap) {
        skipped++;
        continue;
      }

      await Shift.create({
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
        scheduleId: new Types.ObjectId(targetScheduleId),
        staffId: new Types.ObjectId(sourceShift.staffId),
        start: newStart,
        end: newEnd,
        station: sourceShift.station,
        notes: sourceShift.notes || "",
      });

      created++;
    }

    return { created, skipped };
  },
};
