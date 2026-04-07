// Re-export shared types from @sous/types
export type {
  TimeOffRequestStatus,
  TimeOffRequestDTO,
} from "@sous/types";

// ── Server-coupled: Mongoose document interface ──────────────

export interface ITimeOffRequest {
  orgId: unknown;
  locationId: unknown;
  staffId: unknown;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: import("@sous/types").TimeOffRequestStatus;
  reviewedAt?: Date;
  reviewedBy?: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

// Helper function to convert Mongoose document to DTO
export function toTimeOffRequestDTO(
  doc: ITimeOffRequest & { _id: unknown }
): import("@sous/types").TimeOffRequestDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    staffId: String(doc.staffId),
    startDate: doc.startDate,
    endDate: doc.endDate,
    reason: doc.reason,
    status: doc.status,
    reviewedAt: doc.reviewedAt,
    reviewedBy: doc.reviewedBy,
    notes: doc.notes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
