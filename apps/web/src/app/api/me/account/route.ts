import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// DELETE /api/me/account
//
// Backs the mobile Settings → "Delete account" destructive action.
// Deletes the caller's Clerk user. The Clerk webhook (`user.deleted`)
// in `apps/web/src/app/api/webhooks/clerk/route.ts` is the authoritative
// cleanup path for the application's own state — it unlinks the Staff
// row, removes OrganizationMember rows, and (for solo owners) cascades
// the whole org — so this route only needs to trigger Clerk.
//
// Why the caller can delete themselves directly:
//   Clerk's `users.deleteUser` is a privileged admin API call (backend
//   key). The mobile app cannot call it; it must go through our web
//   server. We gate it here on `auth()` and always use the caller's
//   own `userId`, so a compromised mobile client can never delete
//   someone else's account.
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
