import Organization from "@/server/models/Organization";
import { getStripe } from "@/lib/stripe";
import { AnnouncementAcknowledgmentService } from "@/server/services/announcement-acknowledgment.service";
import { AnnouncementService } from "@/server/services/announcement.service";
import { ExchangeShiftService } from "@/server/services/exchange-shift.service";
import { ShiftService } from "@/server/services/shift.service";
import { ScheduleService } from "@/server/services/schedule.service";
import { LaborRequirementService } from "@/server/services/labor-requirement.service";
import { TimeOffRequestService } from "@/server/services/time-off-request.service";
import { StaffAvailabilityService } from "@/server/services/staff-availability.service";
import { StaffService } from "@/server/services/staff.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { AsyncTaskService } from "@/server/services/async-task.service";
import { AIUsageService } from "@/server/services/ai-usage.service";
import { ConversationService } from "@/server/services/conversation.service";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
import { LocationService } from "@/server/services/location.service";
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
      businessType: data.businessType,
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
    if (data.businessType !== undefined) updateData.businessType = data.businessType;

    const doc = await Organization.findByIdAndUpdate(
      orgId,
      { $set: updateData },
      { returnDocument: "after", runValidators: true }
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
      { returnDocument: "after", runValidators: true }
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

  /**
   * Cascade-delete all organization-scoped data and then the organization itself.
   * Used when an owner account is deleted from Clerk.
   */
  async cascadeDelete(orgId: string): Promise<void> {
    const org = await this.getById(orgId);
    if (!org) return;

    if (org.stripeSubscriptionId) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(org.stripeSubscriptionId);
      } catch (err) {
        // Non-fatal: data cleanup should still continue even if Stripe is unavailable.
        console.error("Failed to cancel Stripe subscription during cascade delete:", err);
      }
    }

    await Promise.all([
      AnnouncementAcknowledgmentService.deleteAllByOrgId(orgId),
      AnnouncementService.deleteAllByOrgId(orgId),
      ExchangeShiftService.deleteAllByOrgId(orgId),
      ShiftService.deleteAllByOrgId(orgId),
      ScheduleService.deleteAllByOrgId(orgId),
      LaborRequirementService.deleteAllByOrgId(orgId),
      TimeOffRequestService.deleteAllByOrgId(orgId),
      StaffAvailabilityService.deleteAllByOrgId(orgId),
      StaffService.deleteAllByOrgId(orgId),
      KitchenConfigService.deleteAllByOrgId(orgId),
      AsyncTaskService.deleteAllByOrgId(orgId),
      AIUsageService.deleteAllByOrgId(orgId),
      ConversationService.deleteAllByOrgId(orgId),
      OrganizationMemberService.deleteAllByOrgId(orgId),
      LocationService.deleteAllByOrgId(orgId),
    ]);

    await this.delete(orgId);
  },
};
