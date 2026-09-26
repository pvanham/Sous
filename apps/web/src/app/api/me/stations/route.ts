import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";

// ─────────────────────────────────────────────────────────────
// GET /api/me/stations
//
// Returns the station catalogue (`KitchenConfig.stations`) for the
// caller's location. The mobile "Add skills" chip selector needs the
// full list of stations a staff member could propose, which it can't
// derive from their existing `skills`. Returns an empty array when the
// location has no KitchenConfig yet.
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
    const ctx = await getLocationContext(userId);

    const config = await KitchenConfigService.getByLocation(
      ctx.orgId,
      ctx.locationId,
    );

    return NextResponse.json({ stations: config?.stations ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/me/stations GET] failed:", message);
    return NextResponse.json(
      { error: "Failed to load stations." },
      { status: 500 },
    );
  }
}
