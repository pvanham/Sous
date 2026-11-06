import { clerkClient } from "@clerk/nextjs/server";
import { isStaffAccountRole } from "@/lib/validations/staff.schema";
import { StaffService } from "@/server/services/staff.service";
import type { MemberRole } from "@/server/models/OrganizationMember";
import type { StaffDTO } from "@/types/staff";

type AcceptedInvite = {
  role: MemberRole;
  orgId: string;
  locationId: string | null;
  staffId?: string | null;
};

/**
 * For a staff or shift_lead invite, find the staff row the new account
 * links to and the membership role it gets. The role is the row's
 * `accountAccess`, so a change made while the invite was pending still
 * applies. Other invites, and staff invites with no matching row, keep
 * the invited role.
 */
export async function resolveStaffInvite(
  invite: AcceptedInvite,
  email: string | null,
): Promise<{ role: MemberRole; staff: StaffDTO | null }> {
  if (!isStaffAccountRole(invite.role) || !invite.locationId) {
    return { role: invite.role, staff: null };
  }
  try {
    const staff = await StaffService.findForInviteLink(
      invite.orgId,
      invite.locationId,
      { staffId: invite.staffId, email },
    );
    return { role: staff?.accountAccess ?? invite.role, staff };
  } catch (error) {
    console.error("resolveStaffInvite: staff lookup failed:", error);
    return { role: invite.role, staff: null };
  }
}

/**
 * Link the Clerk user to its staff row and mirror the Clerk account onto
 * it. Non-fatal: the membership already exists, and a failed link shows
 * up on mobile as an unlinked account rather than a lost sign-up.
 */
export async function linkStaffAccount(
  staff: StaffDTO,
  clerkUserId: string,
): Promise<void> {
  try {
    await StaffService.linkClerkUser(
      staff.orgId,
      staff.locationId,
      staff.id,
      clerkUserId,
    );
  } catch (error) {
    console.error("linkStaffAccount: link failed (non-fatal):", error);
    return;
  }
  try {
    await StaffService.mirrorAccountFromClerk(clerkUserId);
  } catch (error) {
    console.error("linkStaffAccount: account mirror failed (non-fatal):", error);
  }
}

/**
 * Set `publicMetadata.role` on the Clerk user. Routing (`proxy.ts`,
 * `/welcome`) reads this before the membership row, so it has to match
 * the role the membership was created with.
 */
export async function syncClerkRole(
  clerkUserId: string,
  role: MemberRole,
): Promise<void> {
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(clerkUserId, {
      publicMetadata: { role },
    });
  } catch (error) {
    console.error("syncClerkRole: metadata update failed (non-fatal):", error);
  }
}
