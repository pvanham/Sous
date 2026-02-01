// Priority levels for labor requirements
export type LaborPriority = "critical" | "high" | "normal" | "low";

// Labor requirement interface matching Mongoose document
export interface ILaborRequirement {
  orgId: unknown; // ObjectId in document, string after conversion
  locationId: unknown; // ObjectId in document, string after conversion
  dayOfWeek: number; // 0-6 (0=Sunday, 1=Monday, etc.)
  station: string; // Must match KitchenConfig.stations
  startTime: string; // "09:00" (HH:MM format)
  endTime: string; // "17:00" (HH:MM format)
  minStaff: number; // Minimum required (>= 1)
  preferredStaff: number; // Ideal count (>= minStaff)
  priority: LaborPriority;
  createdAt: Date;
  updatedAt: Date;
}

// DTO returned from service layer (without Mongoose internals)
export interface LaborRequirementDTO {
  id: string;
  orgId: string;
  locationId: string;
  dayOfWeek: number;
  station: string;
  startTime: string;
  endTime: string;
  minStaff: number;
  preferredStaff: number;
  priority: LaborPriority;
  createdAt: Date;
  updatedAt: Date;
}

// Helper function to convert Mongoose document to DTO
export function toLaborRequirementDTO(
  doc: ILaborRequirement & { _id: unknown }
): LaborRequirementDTO {
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
