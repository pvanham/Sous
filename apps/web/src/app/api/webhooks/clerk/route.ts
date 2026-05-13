import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { dbConnect } from "@/lib/db";
import { OrganizationService } from "@/server/services/organization.service";
import { LocationService } from "@/server/services/location.service";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
import { StaffService } from "@/server/services/staff.service";
import type { MemberRole } from "@/server/models/OrganizationMember";
import { clerkClient } from "@clerk/nextjs/server";

const VALID_INVITED_ROLES: MemberRole[] = ["manager", "shift_lead", "staff"];

export async function POST(req: Request) {
  // You can find this in the Clerk Dashboard -> Webhooks -> choose the webhook
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error(
      "Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local"
    );
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error occured -- no svix headers", {
      status: 400,
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occured", {
      status: 400,
    });
  }

  const eventType = evt.type;

  await dbConnect();

  if (eventType === "user.created") {
    const userId = evt.data.id;
    const publicMetadata = evt.data.public_metadata;
    const email = evt.data.email_addresses[0]?.email_address || "";
    
    // Default org name derived from email if available
    const defaultName = email ? `${email.split('@')[0]}'s Restaurant` : "My Restaurant";

    const metadataRole = publicMetadata?.role as string | undefined;
    const isInvitedMember = metadataRole && publicMetadata?.orgId;

    if (isInvitedMember) {
      const resolvedRole: MemberRole = VALID_INVITED_ROLES.includes(metadataRole as MemberRole)
        ? (metadataRole as MemberRole)
        : "manager";
      const orgId = publicMetadata.orgId as string;
      const locationId = (publicMetadata.locationId as string) || null;

      try {
        await OrganizationMemberService.create({
          orgId,
          locationId,
          clerkUserId: userId,
          role: resolvedRole,
        });
        console.log(`Successfully added user ${userId} as ${resolvedRole} to org ${orgId}`);

        // Link Clerk user to existing Staff record for staff invitations
        if (resolvedRole === "staff" && locationId) {
          const staffId = publicMetadata.staffId as string | undefined;
          try {
            if (staffId) {
              await StaffService.linkClerkUser(orgId, locationId, staffId, userId);
              console.log(`Linked clerk user ${userId} to staff ${staffId}`);
            } else {
              // Fallback: match by email
              const staffByEmail = await StaffService.getByEmail(orgId, locationId, email);
              if (staffByEmail) {
                await StaffService.linkClerkUser(orgId, locationId, staffByEmail.id, userId);
                console.log(`Linked clerk user ${userId} to staff ${staffByEmail.id} via email`);
              }
            }
          } catch (linkError) {
            console.error("Failed to link staff record (non-fatal):", linkError);
          }
        }
      } catch (error) {
        console.error("Failed to create membership:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    } else {
      // PHASE 1: Normal signup as an Owner
      try {
        const newOrg = await OrganizationService.create(userId, {
          name: defaultName,
        });

        await LocationService.create(newOrg.id, {
          name: "Main Kitchen",
          timezone: "America/New_York",
        });

        await OrganizationMemberService.create({
          orgId: newOrg.id,
          locationId: null, // Org-wide access for owner
          clerkUserId: userId,
          role: "owner",
        });
        
        console.log(`Successfully provisioned new owner ${userId} with org ${newOrg.id}`);
      } catch (error) {
        console.error("Failed to provision new organization:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    }
  }

  if (eventType === "user.updated") {
    // Mirror Clerk's profile picture URL onto every Staff /
    // OrganizationMember row linked to this user. This catches edits
    // made through Clerk's hosted account portal (where our app does
    // not see the upload directly) and keeps the mirrored URL in
    // sync with the actual hosted image.
    const userId = evt.data.id;
    const hasImage = (evt.data as { has_image?: boolean }).has_image === true;
    const rawImageUrl =
      (evt.data as { image_url?: string | null }).image_url ?? null;
    const nextImageUrl = hasImage ? rawImageUrl : null;

    if (userId) {
      try {
        await Promise.all([
          StaffService.setImageUrlForClerkUser(userId, nextImageUrl),
          OrganizationMemberService.setImageUrlForClerkUser(
            userId,
            nextImageUrl,
          ),
        ]);
        console.log(
          `Synced profile image for clerk user ${userId} (hasImage=${hasImage})`,
        );
      } catch (error) {
        console.error("Failed to sync profile image on user.updated:", error);
        // Non-fatal: returning 200 keeps Clerk from retrying forever
        // for transient Mongo issues. Webhook can be re-fired manually.
      }
    }
  }

  if (eventType === "user.deleted") {
    const userId = evt.data.id;
    if (!userId) {
      return new Response("No user id", { status: 400 });
    }

    try {
      // Find all memberships for this user
      const memberships = await OrganizationMemberService.listByUserId(userId);

      for (const membership of memberships) {
        if (membership.role === "owner") {
          // PHASE 4: Cascading delete for owners
          const orgId = membership.orgId;

          // 1. Delete all manager clerk accounts for this org
          const allMembers = await OrganizationMemberService.listByOrgId(orgId);
          await Promise.all(
            allMembers
              .filter(m => m.clerkUserId !== userId)
              .map(m => (async () => {
                const client = await clerkClient();
                return client.users.deleteUser(m.clerkUserId).catch(e => {
                   console.error(`Failed to delete clerk user ${m.clerkUserId}:`, e)
                });
              })())
          );

          // 2. Delete all MongoDB data for this org
          await OrganizationMemberService.deleteAllByOrgId(orgId);
          await LocationService.deleteAllByOrgId(orgId);
          await OrganizationService.delete(orgId);
          
          // Staff, Schedule, Shifts, etc. to be deleted here as well
          const Staff = (await import("@/server/models/Staff")).default;
          await Staff.deleteMany({ orgId });
          
          const Schedule = (await import("@/server/models/Schedule")).default;
          await Schedule.deleteMany({ orgId });
          
          const Shift = (await import("@/server/models/Shift")).default;
          await Shift.deleteMany({ orgId });
          
          const LaborRequirement = (await import("@/server/models/LaborRequirement")).default;
          await LaborRequirement.deleteMany({ orgId });
          
          const TimeOffRequest = (await import("@/server/models/TimeOffRequest")).default;
          await TimeOffRequest.deleteMany({ orgId });
          
          const StaffAvailability = (await import("@/server/models/StaffAvailability")).default;
          await StaffAvailability.deleteMany({ orgId });

          console.log(`Completed cascading delete for org ${orgId}`);
        } else if (membership.role === "staff") {
          // Unlink Clerk user from Staff record but preserve scheduling data
          await StaffService.unlinkClerkUser(userId);
          await OrganizationMemberService.delete(membership.id);
          console.log(`Deleted staff membership ${membership.id} and unlinked staff record`);
        } else {
          // Manager / shift_lead: only delete their membership
          await OrganizationMemberService.delete(membership.id);
          console.log(`Deleted ${membership.role} membership ${membership.id}`);
        }
      }
    } catch (error) {
      console.error("Failed to process user.deleted:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
