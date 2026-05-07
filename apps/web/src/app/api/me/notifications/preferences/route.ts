import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { dbConnect } from "@/lib/db";
import { NotificationPreferenceService } from "@/server/services/notification-preference.service";
import { updateNotificationPreferencesSchema } from "@sous/types";

// ─────────────────────────────────────────────────────────────
// GET   /api/me/notifications/preferences  — fetch the caller's prefs
// PATCH /api/me/notifications/preferences  — partial update (deep merge)
//
// Backs `apps/mobile/features/settings/notifications/api.ts`.
//
// Preference rows are keyed by Clerk user id (no orgId/locationId
// filter), which is one of two intentional exceptions to the multi-
// tenancy rule — see the doc comment on `NotificationPreference.ts`.
// `getOrCreate` seeds defaults so a brand-new user always sees a
// fully-populated matrix.
// ─────────────────────────────────────────────────────────────

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
    const prefs = await NotificationPreferenceService.getOrCreate(userId);
    return NextResponse.json(prefs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/me/notifications/preferences GET] failed:", message);
    return NextResponse.json(
      { error: "Failed to load notification preferences." },
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

    const parsed = updateNotificationPreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Invalid notification preferences update.",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    if (
      parsed.data.channels === undefined &&
      parsed.data.categories === undefined &&
      parsed.data.quietHours === undefined
    ) {
      return NextResponse.json(
        { error: "No editable fields supplied." },
        { status: 400 },
      );
    }

    await dbConnect();
    const updated = await NotificationPreferenceService.update(
      userId,
      parsed.data,
    );
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/me/notifications/preferences PATCH] failed:", message);
    return NextResponse.json(
      { error: "Failed to update notification preferences." },
      { status: 500 },
    );
  }
}
