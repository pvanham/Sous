import type { IKitchenConfig, IOperatingHours, IWeeklyOperatingHours, IAISettings, IScheduleGenerationSettings } from "@/server/models/KitchenConfig";
import type { StaffSkill } from "@sous/types";

// Re-export shared types from @sous/types
export type {
  AISettingsDTO,
  ScheduleGenerationSettingsDTO,
  KitchenConfigDTO,
  ConfigChangeImpact,
  SaveKitchenConfigOptions,
  OperatingHoursDTO,
  WeeklyOperatingHoursDTO,
} from "@sous/types";

// Re-export model interfaces for convenience
export type { IOperatingHours, IWeeklyOperatingHours, IAISettings, IScheduleGenerationSettings };

/** Default AI settings applied when the field is missing on legacy documents */
const DEFAULT_AI_SETTINGS: import("@sous/types").AISettingsDTO = {
  monthlyGenerationLimit: 1000,
  subscriptionTier: "free",
};

const DEFAULT_SCHEDULE_GENERATION_SETTINGS: import("@sous/types").ScheduleGenerationSettingsDTO = {
  allowClopening: false,
  minHoursBetweenShifts: 10,
  clopeningWarningThresholdHours: 10,
  overtimeThresholdHours: 40,
  overtimePolicy: "avoid",
  softConstraintPriority: ["preferences", "fairness", "cost"],
};

// Helper function to convert Mongoose document to DTO
export function toKitchenConfigDTO(doc: IKitchenConfig & { _id: unknown }): import("@sous/types").KitchenConfigDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    name: doc.name,
    stations: doc.stations,
    roles: doc.roles,
    managerRoles: doc.managerRoles || [],
    operatingHours: doc.operatingHours,
    minTimeOffAdvanceDays: doc.minTimeOffAdvanceDays ?? 7,
    aiSettings: doc.aiSettings
      ? {
          monthlyGenerationLimit: doc.aiSettings.monthlyGenerationLimit ?? DEFAULT_AI_SETTINGS.monthlyGenerationLimit,
          subscriptionTier: doc.aiSettings.subscriptionTier ?? DEFAULT_AI_SETTINGS.subscriptionTier,
        }
      : { ...DEFAULT_AI_SETTINGS },
    scheduleGenerationSettings: doc.scheduleGenerationSettings
      ? {
        allowClopening: doc.scheduleGenerationSettings.allowClopening ?? DEFAULT_SCHEDULE_GENERATION_SETTINGS.allowClopening,
          minHoursBetweenShifts: doc.scheduleGenerationSettings.minHoursBetweenShifts ?? DEFAULT_SCHEDULE_GENERATION_SETTINGS.minHoursBetweenShifts,
          clopeningWarningThresholdHours: doc.scheduleGenerationSettings.clopeningWarningThresholdHours ?? DEFAULT_SCHEDULE_GENERATION_SETTINGS.clopeningWarningThresholdHours,
          overtimeThresholdHours: doc.scheduleGenerationSettings.overtimeThresholdHours ?? DEFAULT_SCHEDULE_GENERATION_SETTINGS.overtimeThresholdHours,
          overtimePolicy: doc.scheduleGenerationSettings.overtimePolicy ?? DEFAULT_SCHEDULE_GENERATION_SETTINGS.overtimePolicy,
          softConstraintPriority: doc.scheduleGenerationSettings.softConstraintPriority ?? DEFAULT_SCHEDULE_GENERATION_SETTINGS.softConstraintPriority,
        }
      : { ...DEFAULT_SCHEDULE_GENERATION_SETTINGS },
    // Default to "monday" for legacy docs that predate the field. The
    // backfill script in `scripts/backfill-week-starts-on.ts` makes this
    // unnecessary in production once it has run, but the coalesce keeps
    // the application safe before / during that migration.
    weekStartsOn: doc.weekStartsOn ?? "monday",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
