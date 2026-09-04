import { useLocalSearchParams } from "expo-router";

import { AcceptInviteScreen } from "@/features/auth/screens/accept-invite-screen";

/**
 * Universal Link / deep link landing route.
 *
 * Reached by `sous://invite?__clerk_ticket=…` (`scheme: "sous"`).
 * Universal Links (`ios.associatedDomains`) are omitted until a
 * real public APP_DOMAIN exists — localhost is not a valid host
 * and the Ad Hoc profile does not include that capability.
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
