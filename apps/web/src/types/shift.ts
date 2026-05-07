// Re-export shared types from @sous/types
export type {
  ShiftDTO,
  CreateShiftInput,
  UpdateShiftInput,
} from "@sous/types";

// ── Server-coupled: Mongoose document interface ──────────────

export interface IShift {
  orgId: unknown;
  locationId: unknown;
  scheduleId: unknown;
  staffId: unknown;
  start: Date;
  end: Date;
  station: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

// Helper function to convert Mongoose document to DTO
export function toShiftDTO(doc: IShift & { _id: unknown }): import("@sous/types").ShiftDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    scheduleId: String(doc.scheduleId),
    staffId: String(doc.staffId),
    start: doc.start,
    end: doc.end,
    station: doc.station,
    notes: doc.notes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
