import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { OnboardingWizard } from "./_components/OnboardingWizard";

// Owner onboarding wizard entry point.
//
// Self-serve owners reach this page after the regular sign-up flow.
// Invitees (staff / manager / shift_lead) must NEVER mount the wizard —
// it provisions a brand-new owner organization via
// `provisionOrganizationAndLocation`, which would create an orphaned
// org for any invitee who lands here.
//
// We re-check the role server-side (publicMetadata, then pending
// invitation by email as a fallback) so a stale session JWT can't sneak
// an invitee past the gate.
export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const invitedRole = resolveRoleFromMetadata(user.publicMetadata);

  if (invitedRole === "staff") {
    redirect("/welcome");
  }
  if (invitedRole === "manager" || invitedRole === "shift_lead") {
    redirect("/dashboard");
  }

  // Belt-and-braces: when Clerk has not yet copied the invitation's
  // publicMetadata onto the user, look the role up directly on a
  // pending invitation matching this user's email.
  const email = user.emailAddresses[0]?.emailAddress;
  if (email) {
    const invitations = await client.invitations.getInvitationList({
      status: "pending",
    });
    const match = invitations.data.find(
      (inv) => inv.emailAddress.toLowerCase() === email.toLowerCase(),
    );
    const pendingRole = resolveRoleFromMetadata(match?.publicMetadata);
    if (pendingRole === "staff") {
      redirect("/welcome");
    }
    if (pendingRole === "manager" || pendingRole === "shift_lead") {
      redirect("/dashboard");
    }
  }

  return <OnboardingWizard />;
}

function resolveRoleFromMetadata(
  metadata: Record<string, unknown> | undefined | null,
): string | null {
  if (!metadata) return null;
  const role = metadata.role;
  return typeof role === "string" ? role : null;
}
