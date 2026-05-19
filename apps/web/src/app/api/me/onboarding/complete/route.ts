import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { StaffService } from "@/server/services/staff.service";

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
// Response
//   - `200 { ...StaffDTO }` — canonical staff record (with
//     `onboardingCompletedAt` set).
//   - `401` unauthenticated, `404` no staff row, `500` unexpected.
// ─────────────────────────────────────────────────────────────

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
