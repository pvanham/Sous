import type { ILocation } from "@/server/models/Location";

// Re-export model interface for convenience
export type { ILocation };

// DTO returned from service layer (without Mongoose internals)
export interface LocationDTO {
  id: string;
  orgId: string;
  name: string;
  timezone: string;
  twilioPhoneNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Input type for creating a location
export interface CreateLocationInput {
  orgId: string;
  name: string;
  timezone?: string;
  twilioPhoneNumber?: string;
}

// Input type for updating a location
// Note: twilioPhoneNumber can be null to clear the phone number
export interface UpdateLocationInput {
  name?: string;
  timezone?: string;
  twilioPhoneNumber?: string | null;
}

// Helper function to convert Mongoose document to DTO
export function toLocationDTO(doc: ILocation & { _id: unknown }): LocationDTO {
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
