import type { IKitchenConfig, IOperatingHours, IWeeklyOperatingHours } from "@/server/models/KitchenConfig";
import type { StaffSkill } from "@/types/staff";

// Re-export model interfaces for convenience
export type { IOperatingHours, IWeeklyOperatingHours };

// DTO returned from service layer (without Mongoose internals)
export interface KitchenConfigDTO {
  id: string;
  orgId: string;
  locationId: string;
  name: string;
  stations: string[];
  roles: string[];
  operatingHours: IWeeklyOperatingHours;
  createdAt: Date;
  updatedAt: Date;
}

// Helper function to convert Mongoose document to DTO
export function toKitchenConfigDTO(doc: IKitchenConfig & { _id: unknown }): KitchenConfigDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    name: doc.name,
    stations: doc.stations,
    roles: doc.roles,
    operatingHours: doc.operatingHours,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ============================================================
// Config Change Impact Types (for station/role removal warnings)
// ============================================================

/**
 * Impact analysis result for kitchen config changes.
 * Used to show warnings before saving when stations/roles are removed.
 */
export interface ConfigChangeImpact {
  /** Stations being removed from config */
  removedStations: string[];
  /** Roles being removed from config */
  removedRoles: string[];

  /** Impact of station removal (skills are optional, so always cleaned up) */
  stationImpact: {
    /** Number of staff with skills for removed stations */
    affectedStaffCount: number;
    /** Details of affected staff */
    affectedStaff: Array<{
      id: string;
      name: string;
      skillsToRemove: StaffSkill[];
    }>;
    /** Number of historical shifts referencing removed stations (informational only) */
    historicalShiftCount: number;
    /** Number of labor requirements that will be deleted for removed stations */
    laborRequirementCount: number;
    /** Number of staff with removed stations in their preferredStations */
    preferredStationStaffCount: number;
  };

  /** Impact of role removal (CRITICAL - roles are required) */
  roleImpact: {
    /** Total number of staff with the removed role */
    affectedStaffCount: number;
    /** Staff who have ONLY the removed role (need replacement) */
    staffWithOnlyThisRole: Array<{
      id: string;
      name: string;
    }>;
    /** Staff who have other roles (safe to just remove this one) */
    staffWithOtherRoles: Array<{
      id: string;
      name: string;
      remainingRoles: string[];
    }>;
  };

  /** Whether user must select a replacement role before proceeding */
  requiresRoleReplacement: boolean;
  /** Roles available as replacements (remaining after removal) */
  availableReplacementRoles: string[];
}

/**
 * Options for saving kitchen config with cleanup.
 */
export interface SaveKitchenConfigOptions {
  /** Role replacement mapping (required if removing a role that would leave staff with no roles) */
  roleReplacement?: {
    oldRole: string;
    newRole: string;
  };
}
