import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { dbConnect } from "@/lib/db";
import { OrganizationService } from "@/server/services/organization.service";
import { LocationService } from "@/server/services/location.service";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
import type { MemberRole } from "@/server/models/OrganizationMember";
import { clerkClient } from "@clerk/nextjs/server";

const VALID_INVITED_ROLES: MemberRole[] = ["manager", "shift_lead"];

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

  const { id } = evt.data;
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
      try {
        await OrganizationMemberService.create({
          orgId: publicMetadata.orgId as string,
          locationId: (publicMetadata.locationId as string) || null,
          clerkUserId: userId,
          role: resolvedRole,
        });
        console.log(`Successfully added user ${userId} as ${resolvedRole} to org ${publicMetadata.orgId}`);
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

        const newLocation = await LocationService.create(newOrg.id, {
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
        } else {
          // If they were just a manager, only delete their membership
          await OrganizationMemberService.delete(membership.id);
          console.log(`Deleted manager membership ${membership.id}`);
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
