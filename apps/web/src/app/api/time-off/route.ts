import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { addDays, startOfDay } from "date-fns";
import { z } from "zod";

import { getLocationContext } from "@/lib/auth/get-location-context";
import { LocationService } from "@/server/services/location.service";
import { StaffService } from "@/server/services/staff.service";
import { TimeOffRequestService } from "@/server/services/time-off-request.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { NotificationEvents } from "@/server/services/notification-events";
import { submitTimeOffRequestSchema } from "@/lib/validations/time-off-request.schema";
import { weekStartInLocationTz } from "@/lib/utils/timezone";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Same calendar-date contract as `/api/shifts?weekStart=...`. We
 * deliberately don't accept a full timestamp so the URL stays stable
 * and cacheable across timezones.
 */
const weekStartSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be a YYYY-MM-DD date");

// ─────────────────────────────────────────────────────────────
// /api/time-off  —  Mobile (Time-off tab)
//
// Backs:
//   GET  → `apps/mobile/features/time-off/api.ts → fetchTimeOffRequests()`
//   POST → `apps/mobile/features/time-off/api.ts → submitTimeOffRequest()`
//
// Why a route handler (not a Server Action)
//   The mobile app cannot call Server Actions directly — they're a
//   web-only RSC primitive. Per docs/architecture/05-api-and-testing.md
//   §1.5, the mobile public API is one of the five permitted reasons
//   for a route handler.
//
// Service / model reuse
//   This route is a thin adapter over `TimeOffRequestService`. All
//   business logic (overlap rules, status transitions, etc.) stays in
//   the service so the manager-facing Server Actions and the mobile
//   route handler share one source of truth. The configurable
//   `KitchenConfig.minTimeOffAdvanceDays` rule is duplicated from
//   `createTimeOffRequest` in `time-off-request.actions.ts` because
//   that rule is enforced at the action / route boundary (it depends on
//   per-location config, not the request payload).
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)` for both verbs.
//   - `staffId` is resolved server-side from the caller's Clerk JWT via
//     `StaffService.getByClerkUserId`. The body MUST NOT carry a
//     `staffId` (the manager-facing Server Action takes one because it
//     submits on behalf of others; the mobile route does not).
//   - Manager / owner callers without a `Staff` row at the active
//     location get a graceful 200 / [] from GET — same pattern as
//     `/api/shifts` — and a 400 from POST telling them they cannot
//     submit time off without a staff record.
//
// Wire format
//   Dates arrive over the wire as ISO strings (Axios serializes `Date`
//   as ISO). The Zod schemas use `z.coerce.date()` so they accept both
//   ISO strings and `Date` instances. Responses serialize `Date` fields
//   back to ISO strings; the mobile API client revives them to `Date`
//   before returning to the UI.
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/time-off
 *
 * Two modes:
 *   - No `weekStart` → all-time history for the calling staff (backs
 *     the time-off tab; sorted by `startDate` desc).
 *   - `weekStart=YYYY-MM-DD` → the caller's approved + pending
 *     requests overlapping the half-open `[weekStart, weekStart + 7d)`
 *     window. Interpreted as midnight in the location's IANA timezone
 *     (via `weekStartInLocationTz`) so the same week-anchor the schedule
 *     tab uses lines up across surfaces. Backs the approved/pending
 *     time-off overlay on the mobile schedule tab.
 *
 * Manager / owner callers without a `Staff` row receive `[]` rather
 * than an error so the UI renders its empty state.
 */
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const ctx = await getLocationContext(userId);

    const staff = await StaffService.getByClerkUserId(
      ctx.orgId,
      ctx.locationId,
      userId,
    );

    if (!staff) {
      return NextResponse.json([]);
    }

    const rawWeekStart = req.nextUrl.searchParams.get("weekStart");

    if (rawWeekStart !== null) {
      const parsed = weekStartSchema.safeParse(rawWeekStart);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error:
              parsed.error.issues[0]?.message ??
              "weekStart must be a YYYY-MM-DD date.",
          },
          { status: 400 },
        );
      }

      const location = await LocationService.getById(ctx.locationId);
      const tz = location?.timezone ?? "UTC";
      const weekStart = weekStartInLocationTz(parsed.data, tz);
      if (Number.isNaN(weekStart.getTime())) {
        return NextResponse.json(
          { error: "weekStart must be a valid calendar date." },
          { status: 400 },
        );
      }
      const weekEnd = new Date(weekStart.getTime() + WEEK_MS);

      const allInWindow =
        await TimeOffRequestService.getByDateRangeAndStatuses(
          ctx.orgId,
          ctx.locationId,
          weekStart,
          weekEnd,
          ["approved", "pending"],
        );

      // Restrict to the caller's own requests — the overlay shouldn't
      // expose other staff members' time off through the mobile API.
      const mine = allInWindow.filter((r) => r.staffId === staff.id);

      return NextResponse.json(mine);
    }

    const requests = await TimeOffRequestService.getByStaffId(
      ctx.orgId,
      ctx.locationId,
      staff.id,
    );

    return NextResponse.json(requests);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/time-off GET] failed:", message);
    return NextResponse.json(
      { error: "Failed to load time-off requests." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/time-off
 *
 * Submit a new time-off request as the calling staff member. The body
 * is validated against `submitTimeOffRequestSchema` (no `staffId` —
 * resolved server-side). The configurable
 * `KitchenConfig.minTimeOffAdvanceDays` rule is applied here so the
 * mobile client gets the same deadline semantics as the web manager
 * flow.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    const parsed = submitTimeOffRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid time-off request.",
        },
        { status: 400 },
      );
    }

    const ctx = await getLocationContext(userId);

    const staff = await StaffService.getByClerkUserId(
      ctx.orgId,
      ctx.locationId,
      userId,
    );

    if (!staff) {
      return NextResponse.json(
        {
          error:
            "You do not have a staff record at this location and cannot submit time off.",
        },
        { status: 400 },
      );
    }

    // Apply per-location advance-notice rule. We mirror the logic in
    // `createTimeOffRequest` (Server Action) verbatim; if it ever
    // becomes more complex, consider pushing it into the service so
    // both callers stay in sync.
    const config = await KitchenConfigService.getByLocation(
      ctx.orgId,
      ctx.locationId,
    );
    const minAdvanceDays = config?.minTimeOffAdvanceDays ?? 7;
    const minAllowedDate = startOfDay(addDays(new Date(), minAdvanceDays));

    if (parsed.data.startDate < minAllowedDate) {
      return NextResponse.json(
        {
          error: `Time-off requests must be submitted at least ${minAdvanceDays} days in advance.`,
        },
        { status: 400 },
      );
    }

    const created = await TimeOffRequestService.create(
      ctx.orgId,
      ctx.locationId,
      {
        staffId: staff.id,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        type: parsed.data.type,
        reason: parsed.data.reason,
      },
    );

    void NotificationEvents.timeOffSubmitted({
      request: created,
      staffName: staff.name,
      orgId: ctx.orgId,
      locationId: ctx.locationId,
    });

    return NextResponse.json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/time-off POST] failed:", message);

    // Surface the unique-index violation (duplicate request for same
    // staff + date range) as a clean 400 rather than a generic 500.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      return NextResponse.json(
        {
          error:
            "A time-off request for this date range already exists.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to submit time-off request." },
      { status: 500 },
    );
  }
}
