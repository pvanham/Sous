import { Types } from "mongoose";
import OrganizationMember from "@/server/models/OrganizationMember";
import type { MemberRole } from "@/server/models/OrganizationMember";
import {
  OrganizationMemberDTO,
  toOrganizationMemberDTO,
  CreateOrganizationMemberInput,
  UpdateOrganizationMemberInput,
} from "@/types/organization-member";

/**
 * OrganizationMemberService - Service layer for OrganizationMember operations.
 * This is the ONLY place that imports and interacts with the OrganizationMember Mongoose model.
 */
export const OrganizationMemberService = {
  /**
   * Get membership by ID.
   * @param memberId - OrganizationMember document ID
   * @returns OrganizationMemberDTO or null if not found
   */
  async getById(memberId: string): Promise<OrganizationMemberDTO | null> {
    const doc = await OrganizationMember.findById(memberId).lean();
    if (!doc) return null;
    return toOrganizationMemberDTO(doc);
  },

  /**
   * Get membership for a user in an organization (optionally at a specific location).
   * @param clerkUserId - Clerk user ID
   * @param orgId - Organization ID
   * @param locationId - Optional location ID
   * @returns OrganizationMemberDTO or null if not found
   */
  async getByUserAndOrg(
    clerkUserId: string,
    orgId: string,
    locationId?: string | null
  ): Promise<OrganizationMemberDTO | null> {
    const query: Record<string, unknown> = {
      clerkUserId,
      orgId: new Types.ObjectId(orgId),
    };

    if (locationId) {
      query.locationId = new Types.ObjectId(locationId);
    }

    const doc = await OrganizationMember.findOne(query).lean();
    if (!doc) return null;
    return toOrganizationMemberDTO(doc);
  },

  /**
   * Get the first membership for a user (for MVP single-org scenario).
   * @param clerkUserId - Clerk user ID
   * @returns OrganizationMemberDTO or null if not found
   */
  async getFirstByUserId(
    clerkUserId: string
  ): Promise<OrganizationMemberDTO | null> {
    const doc = await OrganizationMember.findOne({ clerkUserId })
      .sort({ createdAt: 1 })
      .lean();
    if (!doc) return null;
    return toOrganizationMemberDTO(doc);
  },

  /**
   * List all memberships for a user.
   * @param clerkUserId - Clerk user ID
   * @returns Array of OrganizationMemberDTO
   */
  async listByUserId(clerkUserId: string): Promise<OrganizationMemberDTO[]> {
    const docs = await OrganizationMember.find({ clerkUserId })
      .sort({ createdAt: 1 })
      .lean();
    return docs.map(toOrganizationMemberDTO);
  },

  /**
   * List all members of an organization.
   * @param orgId - Organization ID
   * @returns Array of OrganizationMemberDTO
   */
  async listByOrgId(orgId: string): Promise<OrganizationMemberDTO[]> {
    const docs = await OrganizationMember.find({
      orgId: new Types.ObjectId(orgId),
    }).lean();
    return docs.map(toOrganizationMemberDTO);
  },

  /**
   * List all members of a specific location.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Array of OrganizationMemberDTO
   */
  async listByLocation(
    orgId: string,
    locationId: string
  ): Promise<OrganizationMemberDTO[]> {
    const docs = await OrganizationMember.find({
      orgId: new Types.ObjectId(orgId),
      $or: [
        { locationId: new Types.ObjectId(locationId) },
        { locationId: null }, // Org-wide members have access to all locations
      ],
    }).lean();
    return docs.map(toOrganizationMemberDTO);
  },

  /**
   * Create a new organization membership.
   * @param data - Membership input
   * @returns Created OrganizationMemberDTO
   */
  async create(
    data: CreateOrganizationMemberInput
  ): Promise<OrganizationMemberDTO> {
    const doc = await OrganizationMember.create({
      orgId: new Types.ObjectId(data.orgId),
      locationId: data.locationId
        ? new Types.ObjectId(data.locationId)
        : null,
      clerkUserId: data.clerkUserId,
      role: data.role,
    });

    return toOrganizationMemberDTO(doc.toObject());
  },

  /**
   * Update an existing membership.
   * @param memberId - OrganizationMember document ID
   * @param data - Partial membership data to update
   * @returns Updated OrganizationMemberDTO or null if not found
   */
  async update(
    memberId: string,
    data: UpdateOrganizationMemberInput
  ): Promise<OrganizationMemberDTO | null> {
    const updateData: Record<string, unknown> = {};

    if (data.locationId !== undefined) {
      updateData.locationId = data.locationId
        ? new Types.ObjectId(data.locationId)
        : null;
    }
    if (data.role !== undefined) updateData.role = data.role;

    const doc = await OrganizationMember.findByIdAndUpdate(
      memberId,
      { $set: updateData },
      { returnDocument: "after", runValidators: true }
    ).lean();

    if (!doc) return null;
    return toOrganizationMemberDTO(doc);
  },

  /**
   * Delete a membership by ID.
   * @param memberId - OrganizationMember document ID
   * @returns true if deleted, false if not found
   */
  async delete(memberId: string): Promise<boolean> {
    const result = await OrganizationMember.deleteOne({ _id: memberId });
    return result.deletedCount > 0;
  },

  /**
   * Delete all memberships for an organization.
   * @param orgId - Organization ID
   * @returns Number of deleted documents
   */
  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await OrganizationMember.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },

  /**
   * Mirror a Clerk-hosted profile image URL onto every membership
   * row for the given Clerk user. Pass `null` to clear it.
   *
   * Returns the number of membership documents updated.
   */
  async setImageUrlForClerkUser(
    clerkUserId: string,
    imageUrl: string | null,
  ): Promise<number> {
    const result = await OrganizationMember.updateMany(
      { clerkUserId },
      { $set: { imageUrl } },
    );
    return result.modifiedCount;
  },

  /**
   * Check if a user has a specific role in an organization.
   * @param clerkUserId - Clerk user ID
   * @param orgId - Organization ID
   * @param role - Role to check
   * @returns true if user has the role
   */
  async hasRole(
    clerkUserId: string,
    orgId: string,
    role: MemberRole
  ): Promise<boolean> {
    const count = await OrganizationMember.countDocuments({
      clerkUserId,
      orgId: new Types.ObjectId(orgId),
      role,
    });
    return count > 0;
  },

  /**
   * Check if a user has access to a specific location.
   * @param clerkUserId - Clerk user ID
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns true if user has access
   */
  async hasLocationAccess(
    clerkUserId: string,
    orgId: string,
    locationId: string
  ): Promise<boolean> {
    const count = await OrganizationMember.countDocuments({
      clerkUserId,
      orgId: new Types.ObjectId(orgId),
      $or: [
        { locationId: new Types.ObjectId(locationId) },
        { locationId: null }, // Org-wide access
      ],
    });
    return count > 0;
  },
};
