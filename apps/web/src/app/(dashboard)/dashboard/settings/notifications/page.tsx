import { auth } from "@clerk/nextjs/server";

import { getLocationContext } from "@/lib/auth/get-location-context";
import { getWebNotificationPreferences } from "@/server/actions/notification-preference.actions";
import { NotificationSettingsForm } from "../_components/NotificationSettingsForm";
import type { MemberRole } from "@/server/models/OrganizationMember";

export default async function NotificationSettingsPage() {
  const { userId } = await auth();

  let role: MemberRole = "manager";
  if (userId) {
    try {
      const ctx = await getLocationContext(userId);
      role = ctx.role;
    } catch {
      // Fall back to the most-restrictive non-staff role; the settings
      // layout already gates this page to owner / manager.
      role = "manager";
    }
  }

  const result = await getWebNotificationPreferences();
  const initialPreferences = result.success ? result.data : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground">
          Choose which manager and owner email alerts you receive from the web
          dashboard. These settings are separate from the Sous mobile app — the
          web app sends email only.
        </p>
      </div>
      <NotificationSettingsForm
        initialPreferences={initialPreferences}
        role={role}
      />
    </div>
  );
}
