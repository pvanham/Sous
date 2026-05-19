"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function SSOCallback() {
  const [hung, setHung] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => setHung(true), 10000);
    return () => clearTimeout(timeoutId);
  }, []);

  if (hung) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background px-6">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <p className="font-semibold">We could not complete sign-in.</p>
          <p className="text-sm text-muted-foreground">
            Please try again, or contact support if this keeps happening.
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/sign-in">Back to sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/sign-up">Create account</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-foreground" />
        <p className="text-muted-foreground font-medium">Completing your login...</p>
      </div>
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/dashboard"
        signUpForceRedirectUrl="/dashboard"
        signInFallbackRedirectUrl="/dashboard"
        signUpFallbackRedirectUrl="/dashboard"
        continueSignUpUrl="/sign-up"
      />
    </div>
  );
}
