import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { StaffService } from "@/server/services/staff.service";
import { StaffAvailabilityService } from "@/server/services/staff-availability.service";

// ─────────────────────────────────────────────────────────────
// GET /api/me/availability — load the caller's weekly availability
// PUT /api/me/availability — replace the caller's weekly availability
//
// Backs the mobile Settings → Availability screen. The staff member
// edits their own availability on their phone; the web manager UI
// continues to work through the per-staff availability editor.
//
// Why a dedicated route
//   The canonical bulk-availability Server Action takes a `staffId`
//   parameter so managers can write on behalf of any staff member.
//   That trust boundary is wrong for the mobile client: we never want
//   the client to choose which staff row it mutates. This route
//   resolves `staffId` from the caller's Clerk JWT via
//   `StaffService.getByClerkUserId` and delegates to the same
//   `StaffAvailabilityService.bulkUpsert` so both surfaces share one
//   source of truth.
//
// Auth & tenancy
//   - Clerk JWT → `auth()` → `getLocationContext` → `StaffService.getByClerkUserId`.
//   - Manager / owner callers with no staff row at this location get a
//     graceful `[]` from GET and a 400 from PUT (same pattern as
//     `/api/time-off`).
// ─────────────────────────────────────────────────────────────

const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM format.")
  .nullable();

/**
 * One day's availability. `unavailable` days may omit the times; for
 * `available` / `preferred` both times must be present and `to > from`.
 */
const dayAvailabilitySchema = z
  .object({
    dayOfWeek: z
      .number()
      .int("Day must be a whole number.")
      .min(0, "Day of week must be 0-6.")
      .max(6, "Day of week must be 0-6."),
    availableFrom: timeStringSchema,
    availableTo: timeStringSchema,
    preference: z.enum(["preferred", "available", "unavailable"]),
    notes: z
      .string()
      .max(500, "Notes must be 500 characters or less.")
      .optional(),
  })
  .refine(
    (data) => {
      if (data.preference === "unavailable") return true;
      if (!data.availableFrom || !data.availableTo) return false;
      return data.availableTo > data.availableFrom;
    },
    {
      message:
        "Available times are required and end time must be after start time.",
      path: ["availableTo"],
    },
  );

/**
 * PUT body. `availabilities` is the full weekly set — callers send
 * whichever of the 7 days they want to store. Anything omitted is
 * treated as "unavailable" on the server (the service deletes and
 * re-inserts the whole set for this staff member).
 */
const bulkBodySchema = z.object({
  availabilities: z
    .array(dayAvailabilitySchema)
    .max(7, "Cannot have more than 7 entries (one per day)."),
});

export async function GET(): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    await dbConnect();
    const ctx = await getLocationContext(userId);

    const staff = await StaffService.getByClerkUserId(
      ctx.orgId,
      ctx.locationId,
      userId,
    );

    if (!staff) {
      return NextResponse.json([]);
    }

    const rows = await StaffAvailabilityService.getByStaffId(
      ctx.orgId,
      ctx.locationId,
      staff.id,
    );

    return NextResponse.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/me/availability GET] failed:", message);
    return NextResponse.json(
      { error: "Failed to load availability." },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest): Promise<Response> {
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

    const parsed = bulkBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid availability payload.",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    await dbConnect();
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
            "You do not have a staff record at this location and cannot set availability.",
        },
        { status: 400 },
      );
    }

    const rows = await StaffAvailabilityService.bulkUpsert(
      ctx.orgId,
      ctx.locationId,
      staff.id,
      parsed.data.availabilities,
    );

    return NextResponse.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/me/availability PUT] failed:", message);
    return NextResponse.json(
      { error: "Failed to update availability." },
      { status: 500 },
    );
  }
}
