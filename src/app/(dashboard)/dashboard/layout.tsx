import Link from "next/link";
import { Home, Calendar, Users, Settings } from "lucide-react";

import { ThemeToggle } from "@/components/shared/ThemeToggle";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/schedule", label: "Schedule", icon: Calendar },
  { href: "/dashboard/staff", label: "Staff", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header - Border-first approach */}
      <header className="border-b border-slate-200 dark:border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            {/* Logo */}
            <Link
              href="/dashboard"
              className="text-lg font-sans font-semibold text-slate-900 dark:text-slate-100 tracking-tight"
            >
              Sous
            </Link>

            {/* Navigation */}
            <nav className="flex items-center gap-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-1.5 text-sm font-sans text-slate-600 dark:text-slate-400 transition-colors hover:text-slate-900 dark:hover:text-slate-100"
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
