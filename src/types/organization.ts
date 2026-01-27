import type { IOrganization } from "@/server/models/Organization";

// Re-export model interface for convenience
export type { IOrganization };

// DTO returned from service layer (without Mongoose internals)
export interface OrganizationDTO {
  id: string;
  ownerId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

// Input type for creating an organization
export interface CreateOrganizationInput {
  ownerId: string;
  name: string;
}

// Input type for updating an organization
export interface UpdateOrganizationInput {
  name?: string;
}

// Helper function to convert Mongoose document to DTO
export function toOrganizationDTO(
  doc: IOrganization & { _id: unknown }
): OrganizationDTO {
  return {
    id: String(doc._id),
    ownerId: doc.ownerId,
    name: doc.name,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
