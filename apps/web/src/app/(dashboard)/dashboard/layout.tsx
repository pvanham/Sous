import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  Home,
  Calendar,
  Users,
  ClipboardList,
  CalendarOff,
  ArrowLeftRight,
  Megaphone,
} from "lucide-react";
import { CustomUserButton } from "@/components/shared/CustomUserButton";
import { LocationSwitcher } from "@/components/shared/LocationSwitcher";
import { AIAssistantPanel } from "@/components/shared/AIAssistantPanel";
import { auth } from "@clerk/nextjs/server";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { ensureRole, getSubscriptionStatus } from "@/lib/auth/guards";
import { listLocations } from "@/server/actions/location.actions";
import { ProvisioningScreen } from "./_components/ProvisioningScreen";
import { SubscriptionExpiredScreen } from "./_components/SubscriptionExpiredScreen";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/schedule", label: "Schedule", icon: Calendar },
  { href: "/dashboard/staff", label: "Staff", icon: Users },
  { href: "/dashboard/labor", label: "Shift Slots", icon: ClipboardList },
  { href: "/dashboard/time-off", label: "Time Off", icon: CalendarOff },
  { href: "/dashboard/exchange", label: "Exchange", icon: ArrowLeftRight },
  { href: "/dashboard/announcements", label: "Announcements", icon: Megaphone },
];

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { userId } = await auth();
  if (!userId) return null;

  const ctx = await getLocationContext(userId).catch((err: unknown) => {
    if (
      err instanceof Error &&
      err.message.includes("Your account is being provisioned")
    ) {
      return null;
    }
    throw err;
  });

  if (!ctx) {
    return <ProvisioningScreen />;
  }

  ensureRole(ctx, ["owner", "manager", "shift_lead"], "/staff-blocked");

  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";
  const isBillingRoute = pathname.startsWith("/dashboard/settings/billing");
  const subscriptionStatus = await getSubscriptionStatus(ctx.orgId);
  if (subscriptionStatus === "expired" && (ctx.role !== "owner" || !isBillingRoute)) {
    return <SubscriptionExpiredScreen role={ctx.role} />;
  }

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
            <AIAssistantPanel locationId={ctx.locationId} />
            <CustomUserButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  );
}
