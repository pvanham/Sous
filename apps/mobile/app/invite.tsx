import { useLocalSearchParams } from "expo-router";

import { AcceptInviteScreen } from "@/features/auth/screens/accept-invite-screen";

/**
 * Universal Link / deep link landing route.
 *
 * Reached by:
 *   - iOS / Android: OS-level Universal Link interception of
 *     `https://<APP_DOMAIN>/invite?__clerk_ticket=…` (configured in
 *     `app.json` `associatedDomains` + Android `intentFilters`).
 *   - Local dev / fallback: `sous://invite?__clerk_ticket=…` via
 *     the existing `scheme: "sous"`.
 *
 * The `AuthGate` in `app/_layout.tsx` exempts the `invite` segment
 * from its sign-in redirect so an unauthenticated invitee can reach
 * this screen before they have a Clerk session.
 */
export default function InviteRoute() {
  const params = useLocalSearchParams<{ __clerk_ticket?: string }>();
  // expo-router decodes percent-encoding for us; the ticket arrives
  // here ready to hand to Clerk.
  const ticket = typeof params.__clerk_ticket === "string"
    ? params.__clerk_ticket
    : null;
  return <AcceptInviteScreen ticket={ticket} />;
}
