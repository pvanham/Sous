// Re-export shared types from @sous/types
export type {
  LaborPriority,
  LaborRequirementDTO,
} from "@sous/types";

// ── Server-coupled: Mongoose document interface ──────────────

export interface ILaborRequirement {
  orgId: unknown;
  locationId: unknown;
  dayOfWeek: number;
  station: string;
  startTime: string;
  endTime: string;
  minStaff: number;
  preferredStaff: number;
  priority: import("@sous/types").LaborPriority;
  createdAt: Date;
  updatedAt: Date;
}

// Helper function to convert Mongoose document to DTO
export function toLaborRequirementDTO(
  doc: ILaborRequirement & { _id: unknown }
): import("@sous/types").LaborRequirementDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    dayOfWeek: doc.dayOfWeek,
    station: doc.station,
    startTime: doc.startTime,
    endTime: doc.endTime,
    minStaff: doc.minStaff,
    preferredStaff: doc.preferredStaff,
    priority: doc.priority,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
