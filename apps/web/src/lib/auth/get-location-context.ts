import { dbConnect } from "@/lib/db";

import { LocationService } from "@/server/services/location.service";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
import { clerkClient } from "@clerk/nextjs/server";
import type { MemberRole } from "@/server/models/OrganizationMember";

export class NoMembershipError extends Error {
  constructor() {
    super("NO_MEMBERSHIP");
    this.name = "NoMembershipError";
  }
}

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
 * Current behavior:
 * - Requires an existing OrganizationMember row for the Clerk user
 * - For org-wide memberships (`locationId = null`), uses Clerk
 *   `publicMetadata.activeLocationId` and falls back to the default location
 *
 * @param clerkUserId - Clerk user ID from auth()
 * @returns LocationContext with orgId, locationId, and role
 * @throws NoMembershipError if user has no membership yet
 * @throws Error if membership exists but no location can be resolved
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

  throw new NoMembershipError();
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
