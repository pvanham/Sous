import Organization from "@/server/models/Organization";
import type { CreateOrganizationInput } from "@/lib/validations/organization.schema";
import {
  OrganizationDTO,
  toOrganizationDTO,
  UpdateOrganizationInput,
} from "@/types/organization";

/**
 * OrganizationService - Service layer for Organization operations.
 * This is the ONLY place that imports and interacts with the Organization Mongoose model.
 */
export const OrganizationService = {
  /**
   * Get organization by ID.
   * @param orgId - Organization document ID
   * @returns OrganizationDTO or null if not found
   */
  async getById(orgId: string): Promise<OrganizationDTO | null> {
    const doc = await Organization.findById(orgId).lean();
    if (!doc) return null;
    return toOrganizationDTO(doc);
  },

  /**
   * Get organization by owner ID (Clerk user ID).
   * @param ownerId - Clerk user ID of the owner
   * @returns OrganizationDTO or null if not found
   */
  async getByOwnerId(ownerId: string): Promise<OrganizationDTO | null> {
    const doc = await Organization.findOne({ ownerId }).lean();
    if (!doc) return null;
    return toOrganizationDTO(doc);
  },

  /**
   * List all organizations for an owner.
   * @param ownerId - Clerk user ID of the owner
   * @returns Array of OrganizationDTO
   */
  async listByOwnerId(ownerId: string): Promise<OrganizationDTO[]> {
    const docs = await Organization.find({ ownerId }).sort({ name: 1 }).lean();
    return docs.map(toOrganizationDTO);
  },

  /**
   * Create a new organization.
   * @param ownerId - Clerk user ID of the owner
   * @param data - Validated organization input
   * @returns Created OrganizationDTO
   */
  async create(
    ownerId: string,
    data: CreateOrganizationInput
  ): Promise<OrganizationDTO> {
    const doc = await Organization.create({
      ownerId,
      name: data.name,
    });

    return toOrganizationDTO(doc.toObject());
  },

  /**
   * Update an existing organization.
   * @param orgId - Organization document ID
   * @param data - Partial organization data to update
   * @returns Updated OrganizationDTO or null if not found
   */
  async update(
    orgId: string,
    data: UpdateOrganizationInput
  ): Promise<OrganizationDTO | null> {
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;

    const doc = await Organization.findByIdAndUpdate(
      orgId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return null;
    return toOrganizationDTO(doc);
  },

  /**
   * Update subscription-related fields on an organization.
   * @param orgId - Organization document ID
   * @param data - Stripe billing fields to update
   * @returns Updated OrganizationDTO or null if not found
   */
  async updateSubscription(
    orgId: string,
    data: {
      stripeCustomerId?: string;
      stripeSubscriptionId?: string | null;
      subscriptionTier?: "free" | "pro" | "enterprise";
      cancelAtPeriodEnd?: boolean;
      currentPeriodEnd?: Date | null;
    }
  ): Promise<OrganizationDTO | null> {
    const updateData: Record<string, unknown> = {};

    if (data.stripeCustomerId !== undefined) updateData.stripeCustomerId = data.stripeCustomerId;
    if (data.stripeSubscriptionId !== undefined) updateData.stripeSubscriptionId = data.stripeSubscriptionId;
    if (data.subscriptionTier !== undefined) updateData.subscriptionTier = data.subscriptionTier;
    if (data.cancelAtPeriodEnd !== undefined) updateData.cancelAtPeriodEnd = data.cancelAtPeriodEnd;
    if (data.currentPeriodEnd !== undefined) updateData.currentPeriodEnd = data.currentPeriodEnd;

    const doc = await Organization.findByIdAndUpdate(
      orgId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return null;
    return toOrganizationDTO(doc);
  },

  /**
   * Delete an organization by ID.
   * @param orgId - Organization document ID
   * @returns true if deleted, false if not found
   */
  async delete(orgId: string): Promise<boolean> {
    const result = await Organization.deleteOne({ _id: orgId });
    return result.deletedCount > 0;
  },
};
