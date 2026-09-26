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
import { getLocationContext, NoMembershipError } from "@/lib/auth/get-location-context";
import { ensureRole, getSubscriptionStatus } from "@/lib/auth/guards";
import { listLocations } from "@/server/actions/location.actions";
import { listSkillChangeRequests } from "@/server/actions/skill-change-request.actions";
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
    if (err instanceof NoMembershipError) {
      return null;
    }
    throw err;
  });

  if (!ctx) {
    redirect("/onboarding");
  }

  ensureRole(ctx, ["owner", "manager", "shift_lead"], "/staff-blocked");

  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";
  const isBillingRoute = pathname.startsWith("/dashboard/settings/billing");

  // Exact match for /dashboard; prefix match for all sub-routes
  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }
  const subscriptionStatus = await getSubscriptionStatus(ctx.orgId);
  if (subscriptionStatus === "expired" && (ctx.role !== "owner" || !isBillingRoute)) {
    return <SubscriptionExpiredScreen role={ctx.role} />;
  }

  const result = await listLocations();
  const locations = result.success ? result.data : [];

  // Pending self-service skill changes drive the in-app badge on the
  // Staff nav item (we have no separate notification inbox on web).
  const skillChangeResult = await listSkillChangeRequests({
    status: "pending",
  });
  const pendingSkillChangeCount = skillChangeResult.success
    ? skillChangeResult.data.length
    : 0;

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
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const active = isActive(item.href);
                const badgeCount =
                  item.href === "/dashboard/staff"
                    ? pendingSkillChangeCount
                    : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-sans transition-colors ${
                      active
                        ? "bg-stone-200/70 dark:bg-white/8 text-stone-900 dark:text-stone-100 font-medium"
                        : "text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-white/5 hover:text-stone-900 dark:hover:text-stone-100"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                    {badgeCount > 0 && (
                      <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white">
                        {badgeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
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
