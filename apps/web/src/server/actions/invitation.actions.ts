"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  inviteManagerSchema,
  inviteStaffSchema,
} from "@/lib/validations/invitation.schema";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { StaffService } from "@/server/services/staff.service";
import type { ActionResponse } from "@/lib/safe-action";

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
