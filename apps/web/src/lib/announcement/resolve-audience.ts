import { ANNOUNCEMENT_AUDIENCE_TOKENS } from "@sous/types";
import type { LocationContext } from "@/lib/auth/get-location-context";
import type { StaffDTO } from "@/types/staff";
import { StaffService } from "@/server/services/staff.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";

function isKnownAudienceToken(value: string): boolean {
  return (
    value === ANNOUNCEMENT_AUDIENCE_TOKENS.everyone ||
    value === ANNOUNCEMENT_AUDIENCE_TOKENS.managers
  );
}

export async function resolveAudienceStaff(
  orgId: string,
  locationId: string,
  targetAudience: readonly string[]
): Promise<StaffDTO[]> {
  if (targetAudience.includes(ANNOUNCEMENT_AUDIENCE_TOKENS.everyone)) {
    const allStaff = await StaffService.list(orgId, locationId);
    return allStaff.filter((member) => member.isActive);
  }

  const selectedRoles = new Set<string>();

  if (targetAudience.includes(ANNOUNCEMENT_AUDIENCE_TOKENS.managers)) {
    const config = await KitchenConfigService.getByLocation(orgId, locationId);
    for (const role of config?.managerRoles ?? []) {
      selectedRoles.add(role);
    }
  }

  for (const entry of targetAudience) {
    if (entry === ANNOUNCEMENT_AUDIENCE_TOKENS.managers) continue;
    if (entry.startsWith("@")) {
      if (!isKnownAudienceToken(entry)) {
        console.warn("[announcement-analytics] Ignoring unknown audience token", {
          token: entry,
          orgId,
          locationId,
        });
      }
      continue;
    }
    selectedRoles.add(entry);
  }

  if (selectedRoles.size === 0) return [];

  const scopedStaff = await StaffService.findStaffByRoles(orgId, locationId, [
    ...selectedRoles,
  ]);
  return scopedStaff.filter((member) => member.isActive);
}

/**
 * `targetAudience` entries that reach this staff member. An announcement
 * whose audience contains any of them is one `resolveAudienceStaff` would
 * return this person for, so reads and notifications stay in agreement.
 */
export function audienceEntriesForStaff(
  staff: StaffDTO,
  managerRoles: readonly string[]
): string[] {
  if (!staff.isActive) return [];

  const entries: string[] = [ANNOUNCEMENT_AUDIENCE_TOKENS.everyone];
  if (staff.roles.some((role) => managerRoles.includes(role))) {
    entries.push(ANNOUNCEMENT_AUDIENCE_TOKENS.managers);
  }
  for (const role of staff.roles) {
    if (!role.startsWith("@")) entries.push(role);
  }
  return entries;
}

/**
 * Audience entries the caller may read through the staff-facing
 * announcement API, or `null` when the caller's role reads every
 * published post at the location. Staff and shift lead accounts without
 * a linked staff row read nothing.
 */
export async function readableAudienceForMember(
  ctx: LocationContext,
  clerkUserId: string
): Promise<string[] | null> {
  if (ctx.role === "owner" || ctx.role === "manager") return null;

  const [staff, config] = await Promise.all([
    StaffService.getByClerkUserId(ctx.orgId, ctx.locationId, clerkUserId),
    KitchenConfigService.getByLocation(ctx.orgId, ctx.locationId),
  ]);
  if (!staff) return [];
  return audienceEntriesForStaff(staff, config?.managerRoles ?? []);
}
