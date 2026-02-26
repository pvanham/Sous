"use server";

import { auth } from "@clerk/nextjs/server";
import {
  kitchenConfigSchema,
  aiSettingsSchema,
  scheduleGenerationSettingsSchema,
} from "@/lib/validations/kitchen-config.schema";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { LaborRequirementService } from "@/server/services/labor-requirement.service";
import { StaffService } from "@/server/services/staff.service";
import { ShiftService } from "@/server/services/shift.service";
import { getLocationContext } from "@/lib/auth/get-location-context";
import type { ActionResponse } from "@/lib/safe-action";
import type {
  KitchenConfigDTO,
  ConfigChangeImpact,
  SaveKitchenConfigOptions,
} from "@/types/kitchen-config";

/**
 * Get the kitchen config for the current user's location.
 * @returns ActionResponse containing the config or null if not found
 */
export async function getKitchenConfig(): Promise<
  ActionResponse<KitchenConfigDTO | null>
> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 3. Service call
    const config = await KitchenConfigService.getByLocation(
      ctx.orgId,
      ctx.locationId
    );

    // 4. Return response
    return { success: true, data: config };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get kitchen config";
    return { success: false, error: message };
  }
}

/**
 * Preview the impact of kitchen config changes before saving.
 * This analyzes which staff would be affected by station/role removal.
 * @param input - New kitchen config data to preview
 * @returns ActionResponse containing the impact analysis
 */
export async function previewKitchenConfigChanges(
  input: unknown
): Promise<ActionResponse<ConfigChangeImpact>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = kitchenConfigSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const newConfig = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Get current config to compare
    const currentConfig = await KitchenConfigService.getByLocation(
      ctx.orgId,
      ctx.locationId
    );

    // If no current config exists, no impact analysis needed
    if (!currentConfig) {
      return {
        success: true,
        data: {
          removedStations: [],
          removedRoles: [],
          stationImpact: {
            affectedStaffCount: 0,
            affectedStaff: [],
            historicalShiftCount: 0,
            laborRequirementCount: 0,
            preferredStationStaffCount: 0,
          },
          roleImpact: {
            affectedStaffCount: 0,
            staffWithOnlyThisRole: [],
            staffWithOtherRoles: [],
          },
          requiresRoleReplacement: false,
          availableReplacementRoles: newConfig.roles,
        },
      };
    }

    // 5. Calculate removed stations and roles
    const newStationsSet = new Set(newConfig.stations.filter((s) => s.trim() !== ""));
    const newRolesSet = new Set(newConfig.roles.filter((r) => r.trim() !== ""));

    const removedStations = currentConfig.stations.filter(
      (s) => !newStationsSet.has(s)
    );
    const removedRoles = currentConfig.roles.filter((r) => !newRolesSet.has(r));

    // 6. Analyze station removal impact
    let stationImpact: ConfigChangeImpact["stationImpact"] = {
      affectedStaffCount: 0,
      affectedStaff: [],
      historicalShiftCount: 0,
      laborRequirementCount: 0,
      preferredStationStaffCount: 0,
    };

    if (removedStations.length > 0) {
      const [affectedStaff, historicalShiftCount, laborRequirementCount, preferredStationStaffCount] =
        await Promise.all([
          StaffService.findStaffByStations(
            ctx.orgId,
            ctx.locationId,
            removedStations
          ),
          ShiftService.countByStations(
            ctx.orgId,
            ctx.locationId,
            removedStations
          ),
          LaborRequirementService.countByStations(
            ctx.orgId,
            ctx.locationId,
            removedStations
          ),
          StaffService.countByPreferredStations(
            ctx.orgId,
            ctx.locationId,
            removedStations
          ),
        ]);

      stationImpact = {
        affectedStaffCount: affectedStaff.length,
        affectedStaff: affectedStaff.map((staff) => ({
          id: staff.id,
          name: staff.name,
          skillsToRemove: staff.skills.filter((skill) =>
            removedStations.includes(skill.station)
          ),
        })),
        historicalShiftCount,
        laborRequirementCount,
        preferredStationStaffCount,
      };
    }

    // 7. Analyze role removal impact
    let roleImpact: ConfigChangeImpact["roleImpact"] = {
      affectedStaffCount: 0,
      staffWithOnlyThisRole: [],
      staffWithOtherRoles: [],
    };

    if (removedRoles.length > 0) {
      const allAffectedStaff = await StaffService.findStaffByRoles(
        ctx.orgId,
        ctx.locationId,
        removedRoles
      );

      const staffWithOnlyThisRole = await StaffService.findStaffWithOnlyRoles(
        ctx.orgId,
        ctx.locationId,
        removedRoles
      );

      const staffWithOnlyRoleIds = new Set(
        staffWithOnlyThisRole.map((s) => s.id)
      );

      const staffWithOtherRoles = allAffectedStaff
        .filter((s) => !staffWithOnlyRoleIds.has(s.id))
        .map((s) => ({
          id: s.id,
          name: s.name,
          remainingRoles: s.roles.filter((r) => !removedRoles.includes(r)),
        }));

      roleImpact = {
        affectedStaffCount: allAffectedStaff.length,
        staffWithOnlyThisRole: staffWithOnlyThisRole.map((s) => ({
          id: s.id,
          name: s.name,
        })),
        staffWithOtherRoles,
      };
    }

    // 8. Determine if role replacement is required
    const requiresRoleReplacement = roleImpact.staffWithOnlyThisRole.length > 0;
    const availableReplacementRoles = newConfig.roles.filter(
      (r) => r.trim() !== ""
    );

    return {
      success: true,
      data: {
        removedStations,
        removedRoles,
        stationImpact,
        roleImpact,
        requiresRoleReplacement,
        availableReplacementRoles,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to preview kitchen config changes";
    return { success: false, error: message };
  }
}

/**
 * Save (create or update) the kitchen config for the current user's location.
 * Handles cleanup of staff skills/roles when stations/roles are removed.
 * @param input - Kitchen config data to save
 * @param options - Optional cleanup settings (role replacement mapping)
 * @returns ActionResponse containing the saved config
 */
export async function saveKitchenConfig(
  input: unknown,
  options?: SaveKitchenConfigOptions
): Promise<ActionResponse<KitchenConfigDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = kitchenConfigSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const validatedData = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Get current config to check for removals
    const currentConfig = await KitchenConfigService.getByLocation(
      ctx.orgId,
      ctx.locationId
    );

    if (currentConfig) {
      // 5. Calculate removed stations and roles
      const newStationsSet = new Set(
        validatedData.stations.filter((s) => s.trim() !== "")
      );
      const newRolesSet = new Set(
        validatedData.roles.filter((r) => r.trim() !== "")
      );

      const removedStations = currentConfig.stations.filter(
        (s) => !newStationsSet.has(s)
      );
      const removedRoles = currentConfig.roles.filter(
        (r) => !newRolesSet.has(r)
      );

      // 6. Handle station removal - clean up skills, labor requirements, preferredStations
      if (removedStations.length > 0) {
        await StaffService.removeSkillsByStations(
          ctx.orgId,
          ctx.locationId,
          removedStations
        );
        await LaborRequirementService.deleteByStations(
          ctx.orgId,
          ctx.locationId,
          removedStations
        );
        await StaffService.removePreferredStations(
          ctx.orgId,
          ctx.locationId,
          removedStations
        );
      }

      // 7. Handle role removal
      if (removedRoles.length > 0) {
        // Check if any staff would be left with no roles
        const staffWithOnlyThisRole = await StaffService.findStaffWithOnlyRoles(
          ctx.orgId,
          ctx.locationId,
          removedRoles
        );

        if (staffWithOnlyThisRole.length > 0) {
          // Role replacement is required
          if (!options?.roleReplacement) {
            return {
              success: false,
              error: `Cannot remove role(s): ${removedRoles.join(", ")}. ${staffWithOnlyThisRole.length} staff member(s) have this as their only role. Please select a replacement role.`,
            };
          }

          // Validate replacement role exists in new config
          if (!newRolesSet.has(options.roleReplacement.newRole)) {
            return {
              success: false,
              error: `Invalid replacement role: ${options.roleReplacement.newRole}. Must be one of the remaining roles.`,
            };
          }

          // Replace the role for affected staff
          await StaffService.replaceRole(
            ctx.orgId,
            ctx.locationId,
            options.roleReplacement.oldRole,
            options.roleReplacement.newRole
          );
        }

        // Remove the role from staff who have other roles
        for (const role of removedRoles) {
          await StaffService.removeRoleFromStaff(ctx.orgId, ctx.locationId, role);
        }
      }
    }

    // 8. Save the new config
    const config = await KitchenConfigService.upsert(
      ctx.orgId,
      ctx.locationId,
      validatedData
    );

    // 9. Return response
    return { success: true, data: config };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save kitchen config";
    return { success: false, error: message };
  }
}

/**
 * Save only the AI settings for the current user's location.
 * @param input - AI settings data (monthlyGenerationLimit, subscriptionTier)
 * @returns ActionResponse containing the updated config
 */
export async function saveAISettings(
  input: unknown
): Promise<ActionResponse<KitchenConfigDTO>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const parsed = aiSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error:
          parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const ctx = await getLocationContext(userId);

    const result = await KitchenConfigService.updateAISettings(
      ctx.orgId,
      ctx.locationId,
      parsed.data
    );

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save",
    };
  }
}

/**
 * Save only the schedule generation settings for the current user's location.
 * @param input - Schedule generation settings (allowClopening, minHoursBetweenShifts)
 * @returns ActionResponse containing the updated config
 */
export async function saveScheduleGenerationSettings(
  input: unknown
): Promise<ActionResponse<KitchenConfigDTO>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const parsed = scheduleGenerationSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error:
          parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const ctx = await getLocationContext(userId);

    const result = await KitchenConfigService.updateScheduleGenerationSettings(
      ctx.orgId,
      ctx.locationId,
      parsed.data
    );

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save",
    };
  }
}
