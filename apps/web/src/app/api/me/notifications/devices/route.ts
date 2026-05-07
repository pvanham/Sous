import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { dbConnect } from "@/lib/db";
import { DeviceTokenService } from "@/server/services/device-token.service";
import { registerDeviceTokenSchema } from "@sous/types";

// ─────────────────────────────────────────────────────────────
// POST   /api/me/notifications/devices
//   Body: { expoPushToken, platform: "ios" | "android", deviceName? }
//   Registers (or refreshes) the caller's device push token. Idempotent.
//
// DELETE /api/me/notifications/devices?token=ExponentPushToken[...]
//   Soft-revokes a single token — used by the mobile sign-out hook so
//   we stop pushing to a device that no longer belongs to the user.
//
// Both verbs gate on `auth()` (any authenticated user) and write to a
// per-Clerk-user collection (`devicetokens`). No orgId/locationId
// filter — see the model file for the rationale.
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
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

    const parsed = registerDeviceTokenSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid device registration.",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    await dbConnect();
    const result = await DeviceTokenService.register({
      clerkUserId: userId,
      expoPushToken: parsed.data.expoPushToken,
      platform: parsed.data.platform,
      deviceName: parsed.data.deviceName ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      "[api/me/notifications/devices POST] failed:",
      message,
    );
    return NextResponse.json(
      { error: "Failed to register device." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json(
        { error: "Missing token query parameter." },
        { status: 400 },
      );
    }

    await dbConnect();
    await DeviceTokenService.revoke(token);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      "[api/me/notifications/devices DELETE] failed:",
      message,
    );
    return NextResponse.json(
      { error: "Failed to revoke device." },
      { status: 500 },
    );
  }
}
