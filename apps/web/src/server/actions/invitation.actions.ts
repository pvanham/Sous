"use server";

import { z } from "zod";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  inviteManagerSchema,
  inviteStaffSchema,
} from "@/lib/validations/invitation.schema";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { StaffService } from "@/server/services/staff.service";
import { dbConnect } from "@/lib/db";
import type { ActionResponse } from "@/lib/safe-action";

/**
 * Split a stored full name (Staff records keep a single `name` field)
 * into the `firstName` / `lastName` pair the sign-up form expects.
 * The first whitespace-delimited token is the first name; everything
 * after it is the last name. A single-token name yields an empty last
 * name (the form then leaves that field editable so it can still be
 * filled in before submitting).
 */
function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "", lastName: "" };
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, idx),
    lastName: trimmed.slice(idx + 1),
  };
}

/**
 * Extract the Clerk invitation id from a `__clerk_ticket` JWT without
 * verifying its signature. The id lives in the `sid` claim of the
 * (base64url) payload. We don't need to trust the token here: it's only
 * used to look the invitation up through the Clerk Backend API, which
 * returns nothing for a bogus id, and the data we surface (email + name)
 * is the same data the ticket already authorizes the holder to see.
 */
function decodeTicketInvitationId(ticket: string): string | null {
  const parts = ticket.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    ) as { sid?: unknown };
    return typeof payload.sid === "string" && payload.sid.startsWith("inv_")
      ? payload.sid
      : null;
  } catch {
    return null;
  }
}

/**
 * Public origin used to build the invite redirect URL Clerk emails to
 * the recipient. Always points at the new `/invite` landing page,
 * which doubles as a Universal Link target (the mobile app intercepts
 * matching URLs at the OS level) and a web fallback (desktop users
 * are forwarded to the existing `/sign-up` ticket flow).
 *
 * Falls back to `http://localhost:3000` in local dev when the env
 * var is missing — production deployments must set
 * `NEXT_PUBLIC_APP_URL` to the canonical public hostname so the
 * Universal Link association files at that host are reachable.
 */
const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const INVITE_REDIRECT_URL = `${APP_ORIGIN}/invite`;

export async function inviteManager(
  input: unknown
): Promise<ActionResponse<{ id: string; emailAddress: string }>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Validate input
    const parseResult = inviteManagerSchema.safeParse(input);
    if (!parseResult.success) {
      return { 
        success: false, 
        error: parseResult.error.issues[0]?.message ?? "Invalid input" 
      };
    }
    const data = parseResult.data;

    // 3. Get context & enforce owner access
    const ctx = await getLocationContext(userId);
    if (ctx.role !== "owner") {
      return { success: false, error: "Only owners can invite managers" };
    }

    // 4. Send invitation via Clerk
    // Pass orgId and locationId in publicMetadata so webhook can parse it
    const client = await clerkClient();
    const invitation = await client.invitations.createInvitation({
      emailAddress: data.email,
      ignoreExisting: true,
      redirectUrl: INVITE_REDIRECT_URL,
      publicMetadata: {
        role: "manager",
        orgId: ctx.orgId,
        locationId: data.locationId === "org-wide" ? null : data.locationId,
      },
    });

    return { 
      success: true, 
      data: { id: invitation.id, emailAddress: invitation.emailAddress } 
    };
  } catch (error) {
    console.error("inviteManager error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to invite manager" 
    };
  }
}

/**
 * Send an app invitation email to an existing staff member.
 * Only owners and managers can invite staff.
 */
export async function inviteStaffToApp(
  input: unknown
): Promise<ActionResponse<{ id: string; emailAddress: string }>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Validate input
    const parseResult = inviteStaffSchema.safeParse(input);
    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const { staffId } = parseResult.data;

    // 3. Get context & enforce owner/manager access
    const ctx = await getLocationContext(userId);
    if (ctx.role !== "owner" && ctx.role !== "manager") {
      return {
        success: false,
        error: "Only owners and managers can invite staff",
      };
    }

    // 4. Fetch the staff record and verify it belongs to this org/location
    const staffMember = await StaffService.getById(
      ctx.orgId,
      ctx.locationId,
      staffId
    );
    if (!staffMember) {
      return { success: false, error: "Staff member not found" };
    }

    // 5. Guard: already linked to a Clerk account
    if (staffMember.clerkUserId) {
      return {
        success: false,
        error: "This staff member already has an account",
      };
    }

    // 6. Send invitation via Clerk with staff-specific metadata
    const client = await clerkClient();
    const invitation = await client.invitations.createInvitation({
      emailAddress: staffMember.email,
      ignoreExisting: true,
      redirectUrl: INVITE_REDIRECT_URL,
      publicMetadata: {
        role: "staff",
        orgId: ctx.orgId,
        locationId: ctx.locationId,
        staffId,
      },
    });

    // 7. Mark the staff record as pending
    await StaffService.setInvitationStatus(staffId, "pending");

    return {
      success: true,
      data: { id: invitation.id, emailAddress: invitation.emailAddress },
    };
  } catch (error) {
    console.error("inviteStaffToApp error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to invite staff member",
    };
  }
}

const invitationPrefillSchema = z.object({
  ticket: z.string().min(1, "Missing invitation ticket"),
});

export type InvitationPrefill = {
  email: string;
  firstName: string;
  lastName: string;
};

/**
 * Resolve the data needed to pre-fill (and lock) the accept-invitation
 * sign-up form directly from the `__clerk_ticket` token, without
 * touching Clerk's client SDK. The page calls this once on mount.
 *
 * Doing the lookup server-side avoids initializing a client `SignUp`
 * from the ticket just to read the email — that path consumed the
 * ticket and triggered Clerk client-side navigation, producing a
 * sign-up reload loop.
 *
 * The ticket's `sid` claim is the invitation id; we look the invitation
 * up through the Backend API to get the verified email, and (for staff
 * invites) read the linked Staff record's name within its own tenant
 * scope. `firstName`/`lastName` are empty for manager invites (no Staff
 * record), in which case the form leaves those fields editable.
 *
 * Intentionally unauthenticated — the invitee has no session yet. It is
 * safe because it only echoes back data the ticket holder already has
 * access to, scoped to the exact invitation the ticket encodes.
 */
export async function getInvitationPrefill(
  input: unknown
): Promise<ActionResponse<InvitationPrefill | null>> {
  try {
    const parsed = invitationPrefillSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const invitationId = decodeTicketInvitationId(parsed.data.ticket);
    if (!invitationId) {
      return { success: true, data: null };
    }

    const client = await clerkClient();
    const { data: invitations } = await client.invitations.getInvitationList({
      query: invitationId,
    });
    const invite = invitations.find((inv) => inv.id === invitationId);
    if (!invite) {
      return { success: true, data: null };
    }

    let firstName = "";
    let lastName = "";

    const meta = (invite.publicMetadata ?? {}) as {
      role?: string;
      orgId?: string;
      locationId?: string;
      staffId?: string;
    };

    if (
      meta.role === "staff" &&
      meta.orgId &&
      meta.locationId &&
      meta.staffId
    ) {
      await dbConnect();
      const staff = await StaffService.getById(
        meta.orgId,
        meta.locationId,
        meta.staffId
      );
      if (staff) {
        ({ firstName, lastName } = splitName(staff.name));
      }
    }

    return {
      success: true,
      data: { email: invite.emailAddress, firstName, lastName },
    };
  } catch (error) {
    console.error("getInvitationPrefill error:", error);
    return {
      success: false,
      error: "Failed to load invitation details",
    };
  }
}
