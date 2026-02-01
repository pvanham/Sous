// Availability preference levels
export type AvailabilityPreference = "preferred" | "available" | "unavailable";

// StaffAvailability interface matching Mongoose document
export interface IStaffAvailability {
  orgId: unknown; // ObjectId in document, string after conversion
  locationId: unknown; // ObjectId in document, string after conversion
  staffId: unknown; // ObjectId in document, string after conversion
  dayOfWeek: number; // 0-6 (0=Sunday, 1=Monday, etc.)
  availableFrom: string | null; // "09:00" (HH:MM format) or null if unavailable
  availableTo: string | null; // "22:00" (HH:MM format) or null if unavailable
  preference: AvailabilityPreference;
  notes: string; // Optional notes (e.g., "Has class until 2pm")
  createdAt: Date;
  updatedAt: Date;
}

// DTO returned from service layer (without Mongoose internals)
export interface StaffAvailabilityDTO {
  id: string;
  orgId: string;
  locationId: string;
  staffId: string;
  dayOfWeek: number;
  availableFrom: string | null;
  availableTo: string | null;
  preference: AvailabilityPreference;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

// Input type for creating/updating availability (used by Zod schema)
export interface StaffAvailabilityInput {
  staffId: string;
  dayOfWeek: number;
  availableFrom: string | null;
  availableTo: string | null;
  preference: AvailabilityPreference;
  notes?: string;
}

// Bulk input for setting weekly availability
export interface BulkAvailabilityInput {
  staffId: string;
  availabilities: Array<Omit<StaffAvailabilityInput, "staffId">>;
}

// Helper function to convert Mongoose document to DTO
export function toStaffAvailabilityDTO(
  doc: IStaffAvailability & { _id: unknown }
): StaffAvailabilityDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    staffId: String(doc.staffId),
    dayOfWeek: doc.dayOfWeek,
    availableFrom: doc.availableFrom,
    availableTo: doc.availableTo,
    preference: doc.preference,
    notes: doc.notes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
