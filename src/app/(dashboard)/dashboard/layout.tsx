import Link from "next/link";
import { Home, Calendar, Users, ClipboardList, CalendarOff, Settings } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { LocationSwitcher } from "@/components/shared/LocationSwitcher";
import { auth } from "@clerk/nextjs/server";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { listLocations } from "@/server/actions/location.actions";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/schedule", label: "Schedule", icon: Calendar },
  { href: "/dashboard/staff", label: "Staff", icon: Users },
  { href: "/dashboard/labor", label: "Shift Slots", icon: ClipboardList },
  { href: "/dashboard/time-off", label: "Time Off", icon: CalendarOff },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { userId } = await auth();
  if (!userId) return null;

  const ctx = await getLocationContext(userId);
  const result = await listLocations();
  const locations = result.success ? result.data : [];

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
          <div className="flex items-center gap-4">
            <LocationSwitcher
              locations={locations}
              activeLocationId={ctx.locationId}
              role={ctx.role}
            />
            <ThemeToggle />
            <UserButton
              afterSignOutUrl="/sign-in"
              userProfileMode="navigation"
              userProfileUrl="/dashboard/settings"
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8",
                },
              }}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  );
}
