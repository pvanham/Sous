// Time-off request status values
export type TimeOffRequestStatus = "pending" | "approved" | "denied";

// TimeOffRequest interface matching Mongoose document
export interface ITimeOffRequest {
  orgId: unknown; // ObjectId in document, string after conversion
  locationId: unknown; // ObjectId in document, string after conversion
  staffId: unknown; // ObjectId in document, string after conversion
  startDate: Date; // First day off (inclusive)
  endDate: Date; // Last day off (inclusive)
  reason: string; // "Vacation", "Doctor appointment", etc.
  status: TimeOffRequestStatus;
  reviewedAt?: Date; // When approved/denied
  reviewedBy?: string; // Clerk userId of approver/denier
  notes: string; // Manager note when approving/denying
  createdAt: Date;
  updatedAt: Date;
}

// DTO returned from service layer (without Mongoose internals)
export interface TimeOffRequestDTO {
  id: string;
  orgId: string;
  locationId: string;
  staffId: string;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: TimeOffRequestStatus;
  reviewedAt?: Date;
  reviewedBy?: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

// Helper function to convert Mongoose document to DTO
export function toTimeOffRequestDTO(
  doc: ITimeOffRequest & { _id: unknown }
): TimeOffRequestDTO {
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
