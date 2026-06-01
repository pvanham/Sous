"use client";

import { useClerk } from "@clerk/nextjs";
import { Bot, Smartphone, Apple } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Placeholder store URLs. Once the app is live, swap these for the real
// App Store and Google Play listings (the Android package is already
// `com.sous.mobile` per apps/mobile/app.json).
const APP_STORE_URL = "https://apps.apple.com/app/id0000000000";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.sous.mobile";
const APP_DEEP_LINK = "sous://invite";

export function WelcomeCard() {
  const { signOut } = useClerk();

  return (
    <Card className="w-full shadow-2xl backdrop-blur-3xl border-border">
      <CardHeader className="space-y-1 text-center">
        <div className="w-full flex justify-center mb-2">
          <div className="h-12 w-12 rounded-xl bg-primary border shadow-inner flex items-center justify-center">
            <Bot className="h-6 w-6 text-primary-foreground" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">
          You&apos;re all set
        </CardTitle>
        <CardDescription>
          Finish setting up your account in the Sous mobile app — that&apos;s
          where you&apos;ll see your schedule, pick up shifts, and request
          time off.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <Button asChild className="w-full">
          <a href={APP_DEEP_LINK}>
            <Smartphone className="h-4 w-4" />
            Open Sous app
          </a>
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Don&apos;t have it installed?
            </span>
          </div>
        </div>

        <Button asChild variant="outline" className="w-full">
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
            <Apple className="h-4 w-4" />
            Download on the App Store
          </a>
        </Button>

        <Button asChild variant="outline" className="w-full">
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
            <GooglePlayIcon className="h-4 w-4" />
            Get it on Google Play
          </a>
        </Button>

        <p className="text-muted-foreground text-xs text-center pt-2">
          Sign in with the same email and password you just created.
        </p>
      </CardContent>

      <CardFooter className="flex justify-center border-t pt-6">
        <button
          type="button"
          onClick={() => signOut({ redirectUrl: "/" })}
          className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          Not your phone?{" "}
          <span className="text-foreground font-medium">Sign out</span>
        </button>
      </CardFooter>
    </Card>
  );
}

function GooglePlayIcon({ className }: { className?: string }) {
  // Lucide doesn't ship a Google Play glyph and the official multicolour
  // logo is trademarked. A neutral monochrome play triangle plus the
  // "Get it on Google Play" label is the standard treatment for partner
  // pages that can't use the official badge SVG.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M4.5 2.5v19l15-9.5-15-9.5z" />
    </svg>
  );
}
