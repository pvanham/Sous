import { dbConnect } from "@/lib/db";
import {
  hasLocationAccess,
  type LocationContext,
} from "@/lib/auth/get-location-context";
import type { ViewportContext } from "@/lib/validations/viewport-context.schema";
import { ScheduleService } from "@/server/services/schedule.service";
import { StaffService } from "@/server/services/staff.service";

export interface VerifyViewportAccessInput {
  clerkUserId: string;
  viewport: ViewportContext;
  authenticatedContext: LocationContext;
}

export interface VerifiedViewportContext {
  viewport: ViewportContext;
  accessVerified: true;
  locationResolution: "same_as_auth" | "cross_location_verified";
}

/**
 * Zero-trust verification of frontend-provided viewport context.
 *
 * Independently confirms the authenticated user has access to the
 * claimed locationId and that optional scheduleId / staffId belong
 * to that location. Stale or invalid optional IDs are silently
 * stripped rather than causing a hard failure.
 */
export async function verifyViewportAccess(
  input: VerifyViewportAccessInput
): Promise<VerifiedViewportContext> {
  const { clerkUserId, viewport, authenticatedContext } = input;

  await dbConnect();

  // --- 1. Verify location access ---
  let locationResolution: VerifiedViewportContext["locationResolution"];

  if (viewport.locationId === authenticatedContext.locationId) {
    locationResolution = "same_as_auth";
  } else {
    const allowed = await hasLocationAccess(clerkUserId, viewport.locationId);
    if (!allowed) {
      throw new Error(
        `Access denied: You do not have access to location '${viewport.locationId}'.`
      );
    }
    locationResolution = "cross_location_verified";
  }

  // Build a mutable copy so we can strip stale optional fields
  const sanitizedViewport: ViewportContext = { ...viewport };

  // --- 2. Verify schedule belongs to the location (if provided) ---
  if (sanitizedViewport.scheduleId) {
    const schedule = await ScheduleService.getById(
      authenticatedContext.orgId,
      viewport.locationId,
      sanitizedViewport.scheduleId
    );
    if (!schedule) {
      console.warn(
        `[ViewportVerify] Schedule '${sanitizedViewport.scheduleId}' not found in location '${viewport.locationId}' — stripped from context`
      );
      sanitizedViewport.scheduleId = undefined;
    }
  }

  // --- 3. Verify staff belongs to the location (if provided) ---
  if (sanitizedViewport.staffId) {
    const staff = await StaffService.getById(
      authenticatedContext.orgId,
      viewport.locationId,
      sanitizedViewport.staffId
    );
    if (!staff) {
      console.warn(
        `[ViewportVerify] Staff '${sanitizedViewport.staffId}' not found in location '${viewport.locationId}' — stripped from context`
      );
      sanitizedViewport.staffId = undefined;
    }
  }

  return {
    viewport: sanitizedViewport,
    accessVerified: true,
    locationResolution,
  };
}
