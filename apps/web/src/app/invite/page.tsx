import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Bot } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ─────────────────────────────────────────────────────────────
// /invite — Universal Link landing page
//
// Clerk emails this URL to every invitee (see
// `src/server/actions/invitation.actions.ts`). The mobile app
// registers `/invite` as a Universal Link target, so on a device
// with the app installed the OS hijacks this navigation and opens
// the app directly — this page never renders.
//
// When the OS handoff doesn't fire (desktop browser, missing app,
// in-app webview that blocks Universal Links, etc.) the request
// reaches Next.js and we render the appropriate fallback:
//
//   - Desktop → 307-redirect to `/sign-up?__clerk_ticket=…` so the
//     existing web ticket flow handles the invite.
//   - Mobile → render a short bounce page with two CTAs: one that
//     re-fires the Universal Link (in case the OS handoff was
//     blocked by a third-party email client) and one that falls
//     through to `/sign-up` as a last resort.
//
// The page is intentionally outside the `(auth)` route group so
// no global auth chrome wraps it — invitees are pre-authentication
// by definition.
// ─────────────────────────────────────────────────────────────

interface InvitePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function isMobileUserAgent(userAgent: string): boolean {
  // Mirrors the heuristic used by Apple's "Smart App Banner" — any
  // hit on iPhone/iPad/iPod/Android is treated as a mobile client.
  // We deliberately keep this loose: the consequence of a false
  // positive is one extra tap on the bounce page, not a broken
  // flow.
  return /iPhone|iPad|iPod|Android/i.test(userAgent);
}

function asString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const resolved = await searchParams;
  const ticket = asString(resolved.__clerk_ticket);

  const headerList = await headers();
  const userAgent = headerList.get("user-agent") ?? "";

  // Build the query string we forward to either the mobile deep link
  // or the web sign-up fallback. Preserving `__clerk_ticket` is
  // critical — the ticket is single-use and tied to the invitation.
  const ticketQuery = ticket
    ? `?__clerk_ticket=${encodeURIComponent(ticket)}`
    : "";

  if (!isMobileUserAgent(userAgent)) {
    // Desktop fallback: the existing /sign-up page already handles
    // the ticket flow end-to-end (see
    // apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx).
    redirect(`/sign-up${ticketQuery}`);
  }

  // Mobile fallback: render a short bounce page. The "Open in Sous"
  // CTA points back at this same URL so the OS gets a second chance
  // to intercept (some email-client webviews suppress the first
  // attempt). The "Continue in browser" CTA forwards to /sign-up.
  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-2xl border-border">
          <CardHeader className="space-y-1 text-center">
            <div className="w-full flex justify-center mb-2">
              <div className="h-12 w-12 rounded-xl bg-primary border shadow-inner flex items-center justify-center">
                <Bot className="h-6 w-6 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              Open your invitation
            </CardTitle>
            <CardDescription>
              Finish setting up your account in the Sous app for the best
              experience.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              {/* Re-fires the Universal Link — gives the OS a second
                  chance to intercept. If the app isn't installed,
                  this just reloads the same page. */}
              <a href={`/invite${ticketQuery}`}>Open in Sous app</a>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/sign-up${ticketQuery}`}>
                Continue in browser
              </Link>
            </Button>
            {!ticket ? (
              <p className="text-destructive text-sm text-center pt-2">
                Missing invitation ticket. Please re-open the link from your
                email.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
