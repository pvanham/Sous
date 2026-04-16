import type { ILocation } from "@/server/models/Location";

// Re-export shared types from @sous/types
export type {
  LocationDTO,
  CreateLocationInput,
  UpdateLocationInput,
} from "@sous/types";

// Re-export model interface for convenience
export type { ILocation };

// Helper function to convert Mongoose document to DTO
export function toLocationDTO(doc: ILocation & { _id: unknown }): import("@sous/types").LocationDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    name: doc.name,
    timezone: doc.timezone,
    twilioPhoneNumber: doc.twilioPhoneNumber,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
