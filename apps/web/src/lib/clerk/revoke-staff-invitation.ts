import { clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/backend/errors";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

const STALE_INVITATION_CODES = new Set([
  "invitation_not_pending",
  "resource_not_found",
  "form_identifier_not_found",
]);

type PendingInvitation = {
  id: string;
  emailAddress: string;
  publicMetadata: Record<string, unknown> | null;
};

export type RevokeStaffInvitationsInput = {
  staffId: string;
  email: string;
  /**
   * Invitation id stored on the staff record, if we have one. Revoked
   * directly so an email change after the invite was sent still works.
   */
  clerkInvitationId: string | null;
  /**
   * Skip this id. Used after sending a replacement invite so the new
   * invitation is not revoked along with the ones it supersedes.
   */
  exceptInvitationId?: string;
};

function staffIdFromMetadata(
  metadata: Record<string, unknown> | null
): string | null {
  const staffId = metadata?.staffId;
  return typeof staffId === "string" ? staffId : null;
}

/**
 * An invitation that is already accepted, revoked, or missing cannot
 * be revoked again. That is a successful no-op: nothing pending remains
 * for that id.
 */
function isStaleInvitationError(error: unknown): boolean {
  if (!isClerkAPIResponseError(error)) return false;
  if (error.status === 404) return true;
  return error.errors.some(
    (entry) =>
      STALE_INVITATION_CODES.has(entry.code) ||
      entry.code.endsWith("_not_pending")
  );
}

async function listPendingByQuery(
  client: Awaited<ReturnType<typeof clerkClient>>,
  query: string
): Promise<PendingInvitation[]> {
  const matches: PendingInvitation[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await client.invitations.getInvitationList({
      status: "pending",
      query,
      limit: PAGE_SIZE,
      offset,
    });
    const batch = result.data ?? [];
    matches.push(
      ...batch.map((invitation) => ({
        id: invitation.id,
        emailAddress: invitation.emailAddress,
        publicMetadata: invitation.publicMetadata ?? null,
      }))
    );
    offset += batch.length;
    if (batch.length < PAGE_SIZE || offset >= result.totalCount) {
      return matches;
    }
  }

  throw new Error(
    "Too many pending Clerk invitations matched; refusing to continue"
  );
}

async function revokeOne(
  client: Awaited<ReturnType<typeof clerkClient>>,
  invitationId: string,
  revoked: Set<string>
): Promise<void> {
  if (revoked.has(invitationId)) return;
  try {
    await client.invitations.revokeInvitation(invitationId);
  } catch (error) {
    if (!isStaleInvitationError(error)) throw error;
  }
  revoked.add(invitationId);
}

/**
 * Revoke every pending Clerk invitation that would sign the invitee up
 * against this staff record.
 *
 * The stored invitation id is revoked directly. Pending invitations for
 * the staff email whose publicMetadata.staffId matches are revoked too,
 * which covers rows invited before we stored an id and duplicate
 * invitations left behind by `ignoreExisting`.
 */
export async function revokePendingStaffInvitations(
  input: RevokeStaffInvitationsInput
): Promise<void> {
  const client = await clerkClient();
  const revoked = new Set<string>();
  const skip = input.exceptInvitationId;

  if (input.clerkInvitationId && input.clerkInvitationId !== skip) {
    await revokeOne(client, input.clerkInvitationId, revoked);
  }

  const email = input.email.trim().toLowerCase();
  if (!email) return;

  const pending = await listPendingByQuery(client, email);
  for (const invitation of pending) {
    if (invitation.id === skip || revoked.has(invitation.id)) continue;
    if (invitation.emailAddress.toLowerCase() !== email) continue;
    if (staffIdFromMetadata(invitation.publicMetadata) !== input.staffId) {
      continue;
    }
    await revokeOne(client, invitation.id, revoked);
  }
}
