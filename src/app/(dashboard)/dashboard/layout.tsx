import Link from "next/link";
import { Home, Calendar, Users, ClipboardList, CalendarOff, Settings } from "lucide-react";

import { ThemeToggle } from "@/components/shared/ThemeToggle";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/schedule", label: "Schedule", icon: Calendar },
  { href: "/dashboard/staff", label: "Staff", icon: Users },
  { href: "/dashboard/labor", label: "Labor", icon: ClipboardList },
  { href: "/dashboard/time-off", label: "Time Off", icon: CalendarOff },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header - Border-first approach (no shadows) */}
      <header className="border-b border-stone-300 dark:border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            {/* Logo */}
            <Link
              href="/dashboard"
              className="text-lg font-sans font-semibold text-stone-900 dark:text-stone-100 tracking-tight"
            >
              Sous
            </Link>

            {/* Navigation */}
            <nav className="flex items-center gap-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-1.5 text-sm font-sans text-stone-600 dark:text-stone-400 transition-colors hover:text-stone-900 dark:hover:text-stone-100"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  );
}
