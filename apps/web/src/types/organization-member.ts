import type {
  IOrganizationMember,
  MemberRole as ModelMemberRole,
} from "@/server/models/OrganizationMember";

// Re-export shared types from @sous/types
export type {
  MemberRole,
  OrganizationMemberDTO,
  CreateOrganizationMemberInput,
  UpdateOrganizationMemberInput,
} from "@sous/types";

// Re-export model interfaces for convenience
export type { IOrganizationMember };
// Re-export model's MemberRole as ModelMemberRole to avoid conflict
export type { ModelMemberRole };

// Helper function to convert Mongoose document to DTO
export function toOrganizationMemberDTO(
  doc: IOrganizationMember & { _id: unknown }
): import("@sous/types").OrganizationMemberDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: doc.locationId ? String(doc.locationId) : null,
    clerkUserId: doc.clerkUserId,
    role: doc.role,
    imageUrl: doc.imageUrl ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
