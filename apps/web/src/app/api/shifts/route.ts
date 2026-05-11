import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { LocationService } from "@/server/services/location.service";
import { ShiftService } from "@/server/services/shift.service";
import { StaffService } from "@/server/services/staff.service";
import { weekStartInLocationTz } from "@/lib/utils/timezone";

// ─────────────────────────────────────────────────────────────
// GET /api/shifts?weekStart=YYYY-MM-DD  —  Mobile (Schedule tab)
//
// Backs `apps/mobile/features/schedule/api.ts → fetchWeekShifts()`.
//
// Purpose
//   Return the calling staff member's shifts for the requested 7-day
//   window. Drives both the weekly strip (one dot per day with a
//   shift) and the per-day shift list on the mobile schedule screen.
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)` resolves the active
//     org + location. `staffId` is resolved server-side via
//     `StaffService.getByClerkUserId`. We never accept a `staffId`
//     query parameter — that is the rule for every mobile read.
//
// Query params
//   - `weekStart` (required): ISO date string (`YYYY-MM-DD`).
//     Interpreted as midnight in the location's IANA timezone (via
//     `weekStartInLocationTz`), not UTC — otherwise a 23:00 PDT shift
//     would fall into the wrong calendar week. The window is half-open:
//     `[weekStart, weekStart + 7d)` so paginating forward never double-
//     counts the boundary day.
//
//     The mobile client computes the anchor day to match
//     `KitchenConfig.weekStartsOn`. We accept whatever calendar day it
//     sends and slice 7 days from there — there's no server-side
//     enforcement of which weekday because the mobile UI renders one
//     week at a time and the contract must match what the user
//     physically sees on their phone.
//
// Visibility
//   - DRAFT shifts are filtered out (`publishedOnly: true`) so a
//     manager's in-progress week can never leak to a staff phone.
//
// Response
//   - 200 → `ShiftDTO[]` (empty array when the caller has no shifts
//           that week, OR when the caller is a manager / owner with
//           no Staff row at this location — same graceful pattern as
//           `/api/shifts/next`).
//   - 400 → `{ error }` for missing / malformed `weekStart`.
//   - 401 → `{ error }` when the JWT is missing.
//   - 500 → `{ error }` on unexpected failure.
// ─────────────────────────────────────────────────────────────

/**
 * Zod schema for the `weekStart` query parameter. We require an ISO
 * calendar date (`YYYY-MM-DD`) rather than a full timestamp to keep the
 * URL stable and cacheable, and to match what `Date.toISOString()
 * .slice(0, 10)` produces on the client.
 */
const weekStartSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be a YYYY-MM-DD date");

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const rawWeekStart = req.nextUrl.searchParams.get("weekStart");
    const parsed = weekStartSchema.safeParse(rawWeekStart);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "weekStart query parameter is required.",
        },
        { status: 400 },
      );
    }

    const ctx = await getLocationContext(userId);

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

    const staff = await StaffService.getByClerkUserId(
      ctx.orgId,
      ctx.locationId,
      userId,
    );

    // Manager / owner with no Staff row at this location: there are no
    // "my shifts" to surface. Return an empty array (same convention
    // `/api/shifts/next` follows by returning `null`) so the mobile UI
    // renders its empty state instead of erroring.
    if (!staff) {
      return NextResponse.json([]);
    }

    const shifts = await ShiftService.getByStaffAndWeek(
      ctx.orgId,
      ctx.locationId,
      staff.id,
      weekStart,
      weekEnd,
      { publishedOnly: true },
    );

    return NextResponse.json(shifts);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[api/shifts] failed:", message);
    return NextResponse.json(
      { error: "Failed to load shifts." },
      { status: 500 },
    );
  }
}
