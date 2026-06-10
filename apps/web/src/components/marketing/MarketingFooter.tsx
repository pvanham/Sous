import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-stone-200 dark:border-white/10 bg-background">
      <div className="mx-auto max-w-6xl px-6 py-12 md:flex md:items-center md:justify-between">
        <div className="flex justify-center space-x-6 md:order-2">
          <Link href="/features" className="text-sm text-stone-500 hover:text-stone-900 dark:hover:text-stone-300">
            Features
          </Link>
          <Link href="/pricing" className="text-sm text-stone-500 hover:text-stone-900 dark:hover:text-stone-300">
            Pricing
          </Link>
          <Link href="/privacy" className="text-sm text-stone-500 hover:text-stone-900 dark:hover:text-stone-300">
            Privacy
          </Link>
          <Link href="/terms" className="text-sm text-stone-500 hover:text-stone-900 dark:hover:text-stone-300">
            Terms
          </Link>
        </div>
        <div className="mt-8 md:order-1 md:mt-0">
          <p className="text-center text-sm leading-5 text-stone-500">
            &copy; {new Date().getFullYear()} Sous, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
