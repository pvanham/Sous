"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { ProfileSection } from "./ProfileSection";
import { SecuritySection } from "./SecuritySection";
import { PreferencesSection } from "./PreferencesSection";
import { DangerZoneSection } from "./DangerZoneSection";

const TAB_VALUES = ["profile", "security", "preferences", "danger"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(value: string | null): value is TabValue {
  return value !== null && (TAB_VALUES as readonly string[]).includes(value);
}

export function AccountSettingsTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentTab: TabValue = useMemo(() => {
    const fromUrl = searchParams.get("tab");
    return isTabValue(fromUrl) ? fromUrl : "profile";
  }, [searchParams]);

  // Mirror the active tab into the URL so links from `CustomUserButton`
  // can deep-link straight to "Security", and so the back button works.
  const handleTabChange = useCallback(
    (next: string) => {
      if (!isTabValue(next)) return;
      const params = new URLSearchParams(searchParams.toString());
      if (next === "profile") {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <Tabs
      value={currentTab}
      onValueChange={handleTabChange}
      className="w-full"
    >
      <TabsList className="grid w-full max-w-md grid-cols-4">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
        <TabsTrigger value="preferences">Appearance</TabsTrigger>
        <TabsTrigger value="danger">Danger</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="mt-6 space-y-6">
        <ProfileSection />
      </TabsContent>

      <TabsContent value="security" className="mt-6 space-y-6">
        <SecuritySection />
      </TabsContent>

      <TabsContent value="preferences" className="mt-6 space-y-6">
        <PreferencesSection />
      </TabsContent>

      <TabsContent value="danger" className="mt-6 space-y-6">
        <DangerZoneSection />
      </TabsContent>
    </Tabs>
  );
}
