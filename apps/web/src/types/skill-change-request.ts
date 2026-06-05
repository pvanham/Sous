// Re-export shared types from @sous/types
export type {
  SkillChangeType,
  SkillChangeStatus,
  SkillChangeRequestDTO,
} from "@sous/types";

// ── Server-coupled: Mongoose document interface ──────────────

export interface ISkillChangeRequest {
  orgId: unknown;
  locationId: unknown;
  staffId: unknown;
  staffName: string;
  clerkUserId: string;
  type: import("@sous/types").SkillChangeType;
  station: string;
  proficiency: number;
  reason: string;
  status: import("@sous/types").SkillChangeStatus;
  reviewedAt?: Date | null;
  reviewedBy?: string | null;
  reviewNotes: string;
  createdAt: Date;
  updatedAt: Date;
}

// Helper function to convert Mongoose document to DTO
export function toSkillChangeRequestDTO(
  doc: ISkillChangeRequest & { _id: unknown }
): import("@sous/types").SkillChangeRequestDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    staffId: String(doc.staffId),
    staffName: doc.staffName,
    clerkUserId: doc.clerkUserId,
    type: doc.type,
    station: doc.station,
    proficiency: doc.proficiency as 1 | 2 | 3 | 4 | 5,
    reason: doc.reason,
    status: doc.status,
    reviewedAt: doc.reviewedAt ?? null,
    reviewedBy: doc.reviewedBy ?? null,
    reviewNotes: doc.reviewNotes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
