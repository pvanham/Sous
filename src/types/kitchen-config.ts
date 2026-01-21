import type { IKitchenConfig, IOperatingHours, IWeeklyOperatingHours } from "@/server/models/KitchenConfig";

// Re-export model interfaces for convenience
export type { IOperatingHours, IWeeklyOperatingHours };

// DTO returned from service layer (without Mongoose internals)
export interface KitchenConfigDTO {
  id: string;
  userId: string;
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
    userId: doc.userId,
    name: doc.name,
    stations: doc.stations,
    roles: doc.roles,
    operatingHours: doc.operatingHours,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
