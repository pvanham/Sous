import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
import { StaffService } from "@/server/services/staff.service";
import type { MemberRole } from "@/server/models/OrganizationMember";

const VALID_INVITED_ROLES: MemberRole[] = [
  "manager",
  "shift_lead",
  "staff",
];

/**
 * The mobile app calls this on launch to decide whether the signed-in
 * Clerk user has an OrganizationMember row. Any role is allowed (staff,
 * shift_lead, manager, owner) because managers/owners may want to view
 * their own schedule or submit time-off from the mobile app. Write-side
 * features are still gated server-side via role checks.
 *
 * Self-healing: if no membership is found in Mongo but the Clerk user has
 * invitation metadata, or a pending invitation for their email exists, we
 * provision the OrganizationMember here. This covers two dev-time gaps:
 *
 *   1. The `user.created` webhook was missed (e.g. no ngrok tunnel).
 *   2. An older sign-up path accepted the user without applying the
 *      invitation ticket, leaving invitation metadata unapplied.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  await dbConnect();

  const existing = await OrganizationMemberService.getFirstByUserId(userId);
  if (existing) {
    return NextResponse.json({
      role: existing.role,
      orgId: existing.orgId,
      locationId: existing.locationId,
    });
  }

  const healed = await tryHealMembership(userId);
  if (healed) {
    return NextResponse.json({
      role: healed.role,
      orgId: healed.orgId,
      locationId: healed.locationId,
    });
  }

  return NextResponse.json(
    { error: "No organization membership found for this user." },
    { status: 404 },
  );
}

type HealedMembership = {
  role: MemberRole;
  orgId: string;
  locationId: string | null;
};

/**
 * Try to provision a missing OrganizationMember using Clerk-side data.
 * Looks first at the user's own publicMetadata (set by the `user.created`
 * webhook when a ticket-based sign-up runs), then at pending invitations
 * addressed to the user's email. Returns null if neither path yields
 * usable invitation data.
 */
async function tryHealMembership(
  clerkUserId: string,
): Promise<HealedMembership | null> {
  let client: Awaited<ReturnType<typeof clerkClient>>;
  try {
    client = await clerkClient();
  } catch (error) {
    console.error("[membership self-heal] clerkClient() failed:", error);
    return null;
  }

  let user: Awaited<ReturnType<typeof client.users.getUser>>;
  try {
    user = await client.users.getUser(clerkUserId);
  } catch (error) {
    console.error("[membership self-heal] users.getUser failed:", error);
    return null;
  }

  // Path A: invitation metadata is already on the user (ticket sign-up).
  const fromUserMetadata = parseInvitationMetadata(user.publicMetadata);
  if (fromUserMetadata) {
    console.log(
      `[membership self-heal] provisioning ${clerkUserId} from user.publicMetadata`,
    );
    return provisionMembership(clerkUserId, userPrimaryEmail(user), fromUserMetadata);
  }

  // Path B: invitation is still pending in Clerk for this user's email.
  const email = userPrimaryEmail(user);
  if (!email) return null;

  let pendingInvitations: Awaited<
    ReturnType<typeof client.invitations.getInvitationList>
  >;
  try {
    pendingInvitations = await client.invitations.getInvitationList({
      status: "pending",
    });
  } catch (error) {
    console.error(
      "[membership self-heal] invitations.getInvitationList failed:",
      error,
    );
    return null;
  }

  const invitationList = Array.isArray(pendingInvitations)
    ? pendingInvitations
    : pendingInvitations.data ?? [];

  const matching = invitationList.find(
    (inv) => inv.emailAddress.toLowerCase() === email.toLowerCase(),
  );
  if (!matching) return null;

  const fromInvitation = parseInvitationMetadata(matching.publicMetadata);
  if (!fromInvitation) return null;

  console.log(
    `[membership self-heal] provisioning ${clerkUserId} from pending invitation ${matching.id}`,
  );
  const healed = await provisionMembership(clerkUserId, email, fromInvitation);

  if (healed) {
    // Copy the invitation metadata onto the Clerk user so subsequent
    // lookups can take Path A, and revoke the now-consumed invitation.
    try {
      await client.users.updateUser(clerkUserId, {
        publicMetadata: {
          ...(user.publicMetadata ?? {}),
          role: fromInvitation.role,
          orgId: fromInvitation.orgId,
          locationId: fromInvitation.locationId,
          ...(fromInvitation.staffId ? { staffId: fromInvitation.staffId } : {}),
        },
      });
    } catch (error) {
      console.error(
        "[membership self-heal] users.updateUser (metadata copy) failed:",
        error,
      );
    }
    try {
      await client.invitations.revokeInvitation(matching.id);
    } catch (error) {
      console.error(
        "[membership self-heal] invitations.revokeInvitation failed:",
        error,
      );
    }
  }

  return healed;
}

type InvitationData = {
  role: MemberRole;
  orgId: string;
  locationId: string | null;
  staffId?: string;
};

function parseInvitationMetadata(
  metadata: unknown,
): InvitationData | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;

  const rawRole = m.role;
  const orgId = m.orgId;
  if (typeof rawRole !== "string" || typeof orgId !== "string") return null;
  if (!VALID_INVITED_ROLES.includes(rawRole as MemberRole)) return null;

  const locationId =
    typeof m.locationId === "string" && m.locationId.length > 0
      ? m.locationId
      : null;
  const staffId = typeof m.staffId === "string" ? m.staffId : undefined;

  return {
    role: rawRole as MemberRole,
    orgId,
    locationId,
    staffId,
  };
}

function userPrimaryEmail(user: {
  primaryEmailAddressId: string | null;
  emailAddresses: { id: string; emailAddress: string }[];
}): string | null {
  const primary = user.emailAddresses.find(
    (addr) => addr.id === user.primaryEmailAddressId,
  );
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
}

async function provisionMembership(
  clerkUserId: string,
  email: string | null,
  data: InvitationData,
): Promise<HealedMembership | null> {
  try {
    const created = await OrganizationMemberService.create({
      orgId: data.orgId,
      locationId: data.locationId,
      clerkUserId,
      role: data.role,
    });

    // Mirror the webhook's staff-record linking for staff invitations.
    if (data.role === "staff" && data.locationId) {
      try {
        if (data.staffId) {
          await StaffService.linkClerkUser(
            data.orgId,
            data.locationId,
            data.staffId,
            clerkUserId,
          );
        } else if (email) {
          const staffByEmail = await StaffService.getByEmail(
            data.orgId,
            data.locationId,
            email,
          );
          if (staffByEmail) {
            await StaffService.linkClerkUser(
              data.orgId,
              data.locationId,
              staffByEmail.id,
              clerkUserId,
            );
          }
        }
      } catch (error) {
        console.error(
          "[membership self-heal] StaffService.linkClerkUser failed (non-fatal):",
          error,
        );
      }
    }

    return {
      role: created.role,
      orgId: created.orgId,
      locationId: created.locationId,
    };
  } catch (error) {
    console.error("[membership self-heal] create membership failed:", error);
    return null;
  }
}
