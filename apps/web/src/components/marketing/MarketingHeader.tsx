"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/nextjs";
import { CustomUserButton } from "@/components/shared/CustomUserButton";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
] as const;

export function MarketingHeader() {
  const { isLoaded, isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            Sous
          </Link>
          <nav className="hidden gap-6 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden items-center gap-2 sm:flex">
            {isLoaded && isSignedIn ? (
              <CustomUserButton />
            ) : isLoaded ? (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/sign-in">Log in</Link>
                </Button>
                <Button asChild>
                  <Link href="/sign-up">Start free</Link>
                </Button>
              </>
            ) : null}
          </div>
          {isLoaded && isSignedIn ? (
            <span className="sm:hidden">
              <CustomUserButton />
            </span>
          ) : isLoaded ? (
            <Button className="sm:hidden" size="sm" asChild>
              <Link href="/sign-up">Start free</Link>
            </Button>
          ) : null}
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center border border-border text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:hidden"
            aria-expanded={open}
            aria-controls="marketing-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="marketing-nav"
          className="border-t border-border bg-background md:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col px-6 py-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="py-2.5 text-sm text-foreground"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            {isLoaded && !isSignedIn ? (
              <Link
                href="/sign-in"
                className="py-2.5 text-sm text-foreground"
                onClick={() => setOpen(false)}
              >
                Log in
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
