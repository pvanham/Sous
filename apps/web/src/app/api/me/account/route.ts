import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { OrganizationMemberService } from "@/server/services/organization-member.service";

// ─────────────────────────────────────────────────────────────
// DELETE /api/me/account
//
// Backs the mobile Settings → "Delete account" destructive action.
// Deletes the caller's Clerk user. The Clerk webhook (`user.deleted`)
// in `apps/web/src/app/api/webhooks/clerk/route.ts` is the authoritative
// cleanup path for the application's own state — it unlinks the Staff
// row, removes OrganizationMember rows, and (for owners) cascades the
// whole org — so this route only needs to trigger Clerk.
//
// Why the caller can delete themselves directly:
//   Clerk's `users.deleteUser` is a privileged admin API call (backend
//   key). The mobile app cannot call it; it must go through our web
//   server. We gate it here on `auth()` and always use the caller's
//   own `userId`, so a compromised mobile client can never delete
//   someone else's account.
//
// Why owners are blocked here:
//   Deleting an owner triggers a full organization cascade (every
//   location, schedule, staff record, etc. is destroyed). That is far
//   too destructive to allow from a single mobile tap, where it could
//   be confused with deleting a personal "staff" account. Owners must
//   delete their account from the web dashboard, which surfaces the
//   org-wide consequences explicitly. This is a defence-in-depth guard
//   alongside the mobile UI hiding the button for owners.
// ─────────────────────────────────────────────────────────────

export async function DELETE(): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    // Owners may not self-delete from this endpoint — it would cascade
    // the entire organization. Force them through the web dashboard.
    await dbConnect();
    const memberships = await OrganizationMemberService.listByUserId(userId);
    const isOwner = memberships.some((m) => m.role === "owner");
    if (isOwner) {
      return NextResponse.json(
        {
          error:
            "Owner accounts can't be deleted from the mobile app because it removes the entire organization. Please sign in to the web dashboard to delete your account.",
        },
        { status: 403 },
      );
    }

    const client = await clerkClient();
    await client.users.deleteUser(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/me/account DELETE] failed:", message);
    return NextResponse.json(
      { error: "Failed to delete account. Please contact support." },
      { status: 500 },
    );
  }
}
