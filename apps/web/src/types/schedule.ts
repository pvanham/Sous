// Re-export shared types from @sous/types
export type { ScheduleStatus, ScheduleDTO } from "@sous/types";

// ── Server-coupled: Mongoose document interface ──────────────

export interface ISchedule {
  orgId: unknown;
  locationId: unknown;
  weekStartDate: Date;
  status: import("@sous/types").ScheduleStatus;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

// Helper function to convert Mongoose document to DTO
export function toScheduleDTO(doc: ISchedule & { _id: unknown }): import("@sous/types").ScheduleDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    weekStartDate: doc.weekStartDate,
    status: doc.status,
    notes: doc.notes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
