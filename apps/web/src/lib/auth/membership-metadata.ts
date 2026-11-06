import { clerkClient } from "@clerk/nextjs/server";
import { dbConnect } from "@/lib/db";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
import type { MemberRole } from "@/server/models/OrganizationMember";
import type { OrganizationMemberDTO } from "@/types/organization-member";

export type MembershipMetadata = {
  role: MemberRole;
  orgId: string;
  locationId: string | null;
  staffId?: string;
};

/**
 * Copy a membership onto the Clerk user's `publicMetadata`. Clerk merges
 * top-level keys, so unrelated metadata (e.g. `activeLocationId`) survives.
 */
export async function writeMembershipMetadata(
  clerkUserId: string,
  data: MembershipMetadata,
): Promise<void> {
  const client = await clerkClient();
  await client.users.updateUserMetadata(clerkUserId, {
    publicMetadata: {
      role: data.role,
      orgId: data.orgId,
      locationId: data.locationId,
      ...(data.staffId ? { staffId: data.staffId } : {}),
    },
  });
}

/**
 * Return the caller's invited (non-owner) membership, or null when they
 * own an org or have no membership at all.
 *
 * Mongo is the source of truth for routing gates: Clerk metadata can be
 * empty for an invited member (missed webhook, manual cleanup), and the
 * old metadata-only check sent those people into the owner wizard. When
 * a membership is found, the metadata is repaired so later requests take
 * the session-JWT fast path. A repair failure is logged and does not
 * change the result.
 */
export async function findInvitedMembership(
  clerkUserId: string,
): Promise<OrganizationMemberDTO | null> {
  await dbConnect();
  const memberships = await OrganizationMemberService.listByUserId(clerkUserId);
  if (memberships.some((m) => m.role === "owner")) return null;

  const invited = memberships[0];
  if (!invited) return null;

  try {
    await writeMembershipMetadata(clerkUserId, {
      role: invited.role,
      orgId: invited.orgId,
      locationId: invited.locationId,
    });
  } catch (error) {
    console.error("[membership-metadata] metadata repair failed:", error);
  }

  return invited;
}
