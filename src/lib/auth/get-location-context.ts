import { dbConnect } from "@/lib/db";
import { OrganizationService } from "@/server/services/organization.service";
import { LocationService } from "@/server/services/location.service";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
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

    // If membership is org-wide (locationId is null), get the default location
    if (!locationId) {
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

    return {
      orgId: membership.orgId,
      locationId,
      role: membership.role,
    };
  }

  // 2. No membership - check if user is an organization owner
  const ownedOrg = await OrganizationService.getByOwnerId(clerkUserId);

  if (ownedOrg) {
    // User owns an org but has no membership (shouldn't happen, but handle gracefully)
    // Get the default location and create a membership
    const defaultLocation = await LocationService.getDefaultByOrgId(ownedOrg.id);

    if (!defaultLocation) {
      // Create a default location for the org
      const newLocation = await LocationService.create(ownedOrg.id, {
        name: "Main Kitchen",
        timezone: "America/New_York",
      });

      // Create owner membership
      await OrganizationMemberService.create({
        orgId: ownedOrg.id,
        locationId: null, // Org-wide access
        clerkUserId,
        role: "owner",
      });

      return {
        orgId: ownedOrg.id,
        locationId: newLocation.id,
        role: "owner",
      };
    }

    // Create owner membership
    await OrganizationMemberService.create({
      orgId: ownedOrg.id,
      locationId: null, // Org-wide access
      clerkUserId,
      role: "owner",
    });

    return {
      orgId: ownedOrg.id,
      locationId: defaultLocation.id,
      role: "owner",
    };
  }

  // 3. New user - auto-create organization, location, and membership (MVP bootstrap)
  const newOrg = await OrganizationService.create(clerkUserId, {
    name: "My Restaurant",
  });

  const newLocation = await LocationService.create(newOrg.id, {
    name: "Main Kitchen",
    timezone: "America/New_York",
  });

  await OrganizationMemberService.create({
    orgId: newOrg.id,
    locationId: null, // Org-wide access for owner
    clerkUserId,
    role: "owner",
  });

  return {
    orgId: newOrg.id,
    locationId: newLocation.id,
    role: "owner",
  };
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
