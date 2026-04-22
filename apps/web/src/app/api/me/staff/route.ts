import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { StaffService } from "@/server/services/staff.service";
import { addressSchema } from "@sous/types/validations/staff.schema";

// ─────────────────────────────────────────────────────────────
// GET  /api/me/staff   — fetch the caller's own StaffDTO
// PATCH /api/me/staff  — update the caller's self-editable fields
//
// Backs `apps/mobile/features/profile/api.ts`. The mobile profile
// screen reads its canonical record from here (phone, address, skills,
// preferred stations, …) and writes back only the narrow subset a
// staff member is allowed to edit themselves.
//
// Self-editable fields (PATCH body)
//   - `phone`   (string, validated by the same phone rules used on web)
//   - `address` (`StaffAddress` | `null`) — send `null` to clear
//
// Manager-controlled fields — `roles`, `skills`, `preferredStations`,
// `isActive`, `maxHoursPerWeek`, `minHoursPerWeek`, `hourlyRate`,
// `certifications` — are **rejected** by the schema below. They flow
// through the existing web `updateStaff` server action instead.
//
// Auth & tenancy
//   - `auth()` resolves the Clerk user; `getLocationContext` resolves
//     the active org + location. `staffId` is resolved server-side via
//     `StaffService.getByClerkUserId` — the client never supplies it.
//   - Managers / owners without a Staff row at this location receive
//     `404` on both verbs; mobile handles that by hiding the editable
//     sections and leaving the Clerk name / email in place.
// ─────────────────────────────────────────────────────────────

/**
 * Phone validation mirrors `packages/types/src/validations/staff.schema.ts`
 * but lives inline here so the mobile patch route doesn't pull in
 * `staffBaseSchema` (which carries required-field semantics that
 * would force callers to send the whole record).
 */
const phoneSchema = z
  .string()
  .min(10, "Phone number must be at least 10 characters")
  .refine(
    (val) => {
      const digits = val.replace(/\D/g, "");
      return (
        digits.length === 10 ||
        (digits.length === 11 && digits.startsWith("1"))
      );
    },
    {
      message:
        "Phone number must contain 10 digits (or 11 with country code).",
    },
  );

/**
 * Whitelist of fields a staff member is allowed to self-edit. Any
 * unknown key is rejected so a malicious / buggy client can't slip in
 * a `roles` or `isActive` update by piggy-backing on this endpoint.
 */
const selfUpdateSchema = z
  .object({
    phone: phoneSchema.optional(),
    address: addressSchema.nullable().optional(),
  })
  .strict();

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
      return NextResponse.json(
        { error: "No staff record linked to this account." },
        { status: 404 },
      );
    }

    return NextResponse.json(staff);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/me/staff GET] failed:", message);
    return NextResponse.json(
      { error: "Failed to load profile." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest): Promise<Response> {
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

    const parsed = selfUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid profile update.",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    // Silently ignore no-op PATCHes (no keys sent). Callers that want
    // the current record should GET instead.
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { error: "No editable fields supplied." },
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
        { error: "No staff record linked to this account." },
        { status: 404 },
      );
    }

    const updated = await StaffService.update(
      ctx.orgId,
      ctx.locationId,
      staff.id,
      parsed.data,
    );

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to update profile." },
        { status: 500 },
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/me/staff PATCH] failed:", message);
    return NextResponse.json(
      { error: "Failed to update profile." },
      { status: 500 },
    );
  }
}
