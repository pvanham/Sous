import { ANNOUNCEMENT_AUDIENCE_TOKENS } from "@sous/types";
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
