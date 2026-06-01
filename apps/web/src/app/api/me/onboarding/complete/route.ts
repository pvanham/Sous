import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { StaffService } from "@/server/services/staff.service";
import { StaffAvailabilityService } from "@/server/services/staff-availability.service";
import type { StaffDTO, StaffAvailabilityDTO } from "@sous/types";

// ─────────────────────────────────────────────────────────────
// POST /api/me/onboarding/complete
//
// Stamps `Staff.onboardingCompletedAt` for the caller the first time
// they finish the mobile onboarding wizard. Subsequent calls return
// the existing record unchanged (the service-layer write is filtered
// on `onboardingCompletedAt: null`).
//
// Auth & tenancy
//   - `auth()` resolves the Clerk user; `getLocationContext` resolves
//     the active org + location. The caller's Staff row is resolved
//     via `getByClerkUserId` — the client never supplies a `staffId`.
//   - Managers / owners do not have a Staff row at this location; we
//     respond 404 so the mobile AuthGate can treat them as
//     "skip onboarding" without a special case.
//
// Prerequisites (first completion only)
//   Before stamping for the first time we enforce that the required
//   wizard steps were actually finished — the mirror of the mobile
//   `buildOnboardingChecklist` rules:
//     • profile      — a name and a valid phone number.
//     • availability — a valid hours range and at least one available
//                       day.
//   Stations / notifications are optional and not checked. A request
//   that fails these returns `422 { error, missing }` so the client
//   can route the user back to the offending step. Re-completion
//   (record already stamped) skips the check and is idempotent.
//
// Response
//   - `200 { ...StaffDTO }` — canonical staff record (with
//     `onboardingCompletedAt` set).
//   - `401` unauthenticated, `404` no staff row, `422` incomplete,
//     `500` unexpected.
// ─────────────────────────────────────────────────────────────

/** Mirrors the phone rule in `packages/types` staff schema + mobile. */
function isPhoneValid(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function findMissingSteps(
  staff: StaffDTO,
  availability: StaffAvailabilityDTO[],
): string[] {
  const missing: string[] = [];

  const profileOk = Boolean(staff.name?.trim()) && isPhoneValid(staff.phone);
  if (!profileOk) missing.push("profile");

  const hoursValid = staff.maxHoursPerWeek >= staff.minHoursPerWeek;
  const hasAvailableDay = availability.some(
    (row) =>
      row.preference !== "unavailable" &&
      Boolean(row.availableFrom) &&
      Boolean(row.availableTo),
  );
  if (!hoursValid || !hasAvailableDay) missing.push("availability");

  return missing;
}

function missingMessage(missing: string[]): string {
  const hasProfile = missing.includes("profile");
  const hasAvailability = missing.includes("availability");
  if (hasProfile && hasAvailability) {
    return "Confirm your profile and set your weekly availability before finishing.";
  }
  if (hasProfile) {
    return "Confirm your name and phone number before finishing.";
  }
  return "Set your weekly availability (at least one day you can work) before finishing.";
}

export async function POST(): Promise<Response> {
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

    // Enforce the required steps the first time through. Re-completion
    // (record already stamped) is idempotent and skips the gate so a
    // returning user is never blocked by a later data edit.
    if (staff.onboardingCompletedAt === null) {
      const availability = await StaffAvailabilityService.getByStaffId(
        ctx.orgId,
        ctx.locationId,
        staff.id,
      );
      const missing = findMissingSteps(staff, availability);
      if (missing.length > 0) {
        return NextResponse.json(
          { error: missingMessage(missing), missing },
          { status: 422 },
        );
      }
    }

    const updated = await StaffService.markOnboardingComplete(
      ctx.orgId,
      ctx.locationId,
      staff.id,
    );

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to complete onboarding." },
        { status: 500 },
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/me/onboarding/complete POST] failed:", message);
    return NextResponse.json(
      { error: "Failed to complete onboarding." },
      { status: 500 },
    );
  }
}
