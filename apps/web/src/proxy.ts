import {
  clerkClient,
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/features",
  "/sso-callback(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/invite(.*)",
  "/welcome",
  "/staff-blocked",
  "/api/webhooks/clerk(.*)",
  "/api/webhooks/twilio(.*)",
  "/api/webhooks/stripe(.*)",
]);

function deriveNeedsOnboarding(
  metadataInput: Record<string, unknown> | null | undefined,
): boolean {
  const metadata = (metadataInput ?? {}) as Record<string, unknown>;
  const onboardingComplete = metadata.onboardingComplete === true;
  const invitedRole =
    typeof metadata.role === "string" ? metadata.role : null;
  const isInvitedMember =
    invitedRole === "manager" ||
    invitedRole === "shift_lead" ||
    invitedRole === "staff";
  return !onboardingComplete && !isInvitedMember;
}

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
    });
  }

  const { userId, sessionClaims } = await auth();
  const pathname = request.nextUrl.pathname;
  const isDashboardPath = pathname.startsWith("/dashboard");
  const isOnboardingPath = pathname.startsWith("/onboarding");

  // Fast path: trust the session JWT.
  let needsOnboarding = deriveNeedsOnboarding(
    sessionClaims?.metadata as Record<string, unknown> | undefined,
  );

  // The browser's __session cookie can lag behind a server-side publicMetadata
  // update (e.g. immediately after `completeOnboarding()`). Before firing a
  // redirect that depends on that metadata, re-check against Clerk's
  // authoritative user record so we never bounce a user who has actually
  // finished onboarding back to the wizard (or vice versa).
  const wouldRedirect =
    (isDashboardPath && needsOnboarding) ||
    (isOnboardingPath && !needsOnboarding);

  if (userId && wouldRedirect) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      needsOnboarding = deriveNeedsOnboarding(
        user.publicMetadata as Record<string, unknown> | undefined,
      );
    } catch (err) {
      console.error(
        "[middleware] failed to fetch fresh Clerk user metadata; using JWT claims",
        err,
      );
    }
  }

  if (isDashboardPath && needsOnboarding) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  if (isOnboardingPath && !needsOnboarding) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("x-pathname", request.nextUrl.pathname);
  return response;
});

export const config = {
  matcher: [
    "/((?!_next|.*\\..*).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};
