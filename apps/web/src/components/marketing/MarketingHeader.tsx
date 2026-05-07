"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/nextjs";
import { CustomUserButton } from "@/components/shared/CustomUserButton";

export function MarketingHeader() {
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-stone-200 dark:border-white/10 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-sans font-bold tracking-tight text-foreground">
            Sous
          </Link>
          <nav className="hidden md:flex gap-6">
            <Link href="/features" className="text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
              Features
            </Link>
            <Link href="/pricing" className="text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
              Pricing
            </Link>
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <div className="hidden sm:flex items-center gap-2">
            {isLoaded && isSignedIn ? (
              <CustomUserButton />
            ) : isLoaded ? (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/sign-in">Log in</Link>
                </Button>
                <Button asChild>
                  <Link href="/sign-up">Get Started</Link>
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
