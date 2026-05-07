// Re-export shared types from @sous/types
export type {
  AvailabilityPreference,
  StaffAvailabilityDTO,
  StaffAvailabilityInput,
  BulkAvailabilityInput,
} from "@sous/types";

// ── Server-coupled: Mongoose document interface ──────────────

export interface IStaffAvailability {
  orgId: unknown;
  locationId: unknown;
  staffId: unknown;
  dayOfWeek: number;
  availableFrom: string | null;
  availableTo: string | null;
  preference: import("@sous/types").AvailabilityPreference;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

// Helper function to convert Mongoose document to DTO
export function toStaffAvailabilityDTO(
  doc: IStaffAvailability & { _id: unknown }
): import("@sous/types").StaffAvailabilityDTO {
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
