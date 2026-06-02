import type { IOrganization } from "@/server/models/Organization";

// Re-export shared types from @sous/types
export type {
  OrganizationDTO,
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from "@sous/types";

// Re-export model interface for convenience
export type { IOrganization };

// Helper function to convert Mongoose document to DTO
export function toOrganizationDTO(
  doc: IOrganization & { _id: unknown }
): import("@sous/types").OrganizationDTO {
  return {
    id: String(doc._id),
    ownerId: doc.ownerId,
    name: doc.name,
    businessType: doc.businessType,
    subscriptionTier: doc.subscriptionTier || "free",
    stripeCustomerId: doc.stripeCustomerId,
    stripeSubscriptionId: doc.stripeSubscriptionId,
    cancelAtPeriodEnd: doc.cancelAtPeriodEnd,
    currentPeriodEnd: doc.currentPeriodEnd,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
