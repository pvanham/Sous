import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/features",
  "/sso-callback(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/staff-blocked",
  "/api/webhooks/clerk(.*)",
  "/api/webhooks/twilio(.*)",
  "/api/webhooks/stripe(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
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
