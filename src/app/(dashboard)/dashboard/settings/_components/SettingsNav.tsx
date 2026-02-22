"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UtensilsCrossed, Bot } from "lucide-react";

const navItems = [
  { href: "/dashboard/settings/kitchen", label: "Kitchen", icon: UtensilsCrossed },
  { href: "/dashboard/settings/ai", label: "AI Settings", icon: Bot },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="w-48 shrink-0 border-r border-stone-300 dark:border-white/10 pr-6">
      <div className="space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-sans transition-colors ${
                isActive
                  ? "bg-stone-200 dark:bg-white/10 text-stone-900 dark:text-stone-100"
                  : "text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-white/5 hover:text-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
