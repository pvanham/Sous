import { dbConnect } from "@/lib/db";

import { LocationService } from "@/server/services/location.service";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
import { clerkClient } from "@clerk/nextjs/server";
import type { MemberRole } from "@/server/models/OrganizationMember";

/**
 * Location context returned by getLocationContext.
 * Used by all server actions for multi-location scoping.
 */
export interface LocationContext {
  orgId: string;
  locationId: string;
  role: MemberRole;
}

/**
 * Resolves the organization and location context for a Clerk user.
 *
 * MVP behavior:
 * - If user has no organization, auto-create one with a default location
 * - Returns the first (default) location for single-location MVP
 *
 * Future: Support location switcher UI, multiple locations per user
 *
 * @param clerkUserId - Clerk user ID from auth()
 * @returns LocationContext with orgId, locationId, and role
 * @throws Error if context cannot be resolved
 */
export async function getLocationContext(
  clerkUserId: string
): Promise<LocationContext> {
  await dbConnect();

  // 1. Check if user has an existing membership
  const membership =
    await OrganizationMemberService.getFirstByUserId(clerkUserId);

  if (membership) {
    // User has a membership - resolve their location
    let locationId = membership.locationId;

    // If membership is org-wide (locationId is null), get the active location from Clerk
    if (!locationId) {
      const client = await clerkClient();
      const user = await client.users.getUser(clerkUserId);
      const activeLocationId = user.publicMetadata?.activeLocationId as string | undefined;

      if (activeLocationId) {
        locationId = activeLocationId;
      } else {
        const defaultLocation = await LocationService.getDefaultByOrgId(
          membership.orgId
        );
        if (!defaultLocation) {
          throw new Error(
            "Organization has no locations. Please contact support."
          );
        }
        locationId = defaultLocation.id;
      }
    }

    return {
      orgId: membership.orgId,
      locationId,
      role: membership.role,
    };
  }

  // 2. No membership found - the webhook might still be processing, or user is not invited.
  throw new Error(
    "Your account is being provisioned or you do not have access to any kitchens. Please wait a moment and refresh."
  );
}

/**
 * Checks if a user has access to a specific location.
 *
 * @param clerkUserId - Clerk user ID
 * @param locationId - Location ID to check access for
 * @returns true if user has access, false otherwise
 */
export async function hasLocationAccess(
  clerkUserId: string,
  locationId: string
): Promise<boolean> {
  await dbConnect();

  // Get the location to find its orgId
  const location = await LocationService.getById(locationId);
  if (!location) {
    return false;
  }

  // Check if user has access
  return OrganizationMemberService.hasLocationAccess(
    clerkUserId,
    location.orgId,
    locationId
  );
}
