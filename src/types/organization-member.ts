import type {
  IOrganizationMember,
  MemberRole,
} from "@/server/models/OrganizationMember";

// Re-export model interfaces for convenience
export type { IOrganizationMember, MemberRole };

// DTO returned from service layer (without Mongoose internals)
export interface OrganizationMemberDTO {
  id: string;
  orgId: string;
  locationId: string | null;
  clerkUserId: string;
  role: MemberRole;
  createdAt: Date;
  updatedAt: Date;
}

// Input type for creating an organization member
export interface CreateOrganizationMemberInput {
  orgId: string;
  locationId?: string | null;
  clerkUserId: string;
  role: MemberRole;
}

// Input type for updating an organization member
export interface UpdateOrganizationMemberInput {
  locationId?: string | null;
  role?: MemberRole;
}

// Helper function to convert Mongoose document to DTO
export function toOrganizationMemberDTO(
  doc: IOrganizationMember & { _id: unknown }
): OrganizationMemberDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: doc.locationId ? String(doc.locationId) : null,
    clerkUserId: doc.clerkUserId,
    role: doc.role,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
