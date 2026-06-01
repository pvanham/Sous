import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { WelcomeCard } from "./_components/WelcomeCard";

// /welcome — post-invite landing
//
// The web sign-up page hands every successful invitation-ticket
// completion to this route. Self-serve owner sign-ups never reach
// here (they go to /onboarding instead).
//
// Routing happens server-side so we don't depend on the session JWT,
// which can lag behind a freshly created user's publicMetadata by
// one navigation. Clerk copies the invitation's publicMetadata onto
// the user the moment the ticket is consumed, so the authoritative
// role is always available via the backend API.
//
//   role === "staff"                       → render WelcomeCard
//   role === "manager" | "shift_lead"      → /dashboard
//   role missing + pending invitation      → resolve via invitation
//   no role + no pending invitation        → /onboarding (likely an
//                                            owner who landed here by
//                                            accident; let the
//                                            onboarding gate decide)
export default async function WelcomePage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const role = resolveRoleFromMetadata(user.publicMetadata);

  if (role === "manager" || role === "shift_lead" || role === "owner") {
    redirect("/dashboard");
  }

  if (role === "staff") {
    return <WelcomeCard />;
  }

  // Fallback: Clerk did not promote the invitation publicMetadata onto
  // the user yet (rare, but possible). Look up a pending invitation by
  // email and route by its stored role.
  const email = user.emailAddresses[0]?.emailAddress;
  if (email) {
    const invitations = await client.invitations.getInvitationList({
      status: "pending",
    });
    const match = invitations.data.find(
      (inv) => inv.emailAddress.toLowerCase() === email.toLowerCase(),
    );
    const pendingRole = resolveRoleFromMetadata(match?.publicMetadata);
    if (pendingRole === "manager" || pendingRole === "shift_lead") {
      redirect("/dashboard");
    }
    if (pendingRole === "staff") {
      return <WelcomeCard />;
    }
  }

  // No invitation context at all — most likely a self-serve owner who
  // arrived here via a stale URL. Send them to onboarding, which has
  // its own role guard.
  redirect("/onboarding");
}

function resolveRoleFromMetadata(
  metadata: Record<string, unknown> | undefined | null,
): string | null {
  if (!metadata) return null;
  const role = metadata.role;
  return typeof role === "string" ? role : null;
}
