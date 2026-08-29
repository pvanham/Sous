import { auth } from "@clerk/nextjs/server";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { ensureRole } from "@/lib/auth/guards";
import { KitchenConfigForm } from "../_components/KitchenConfigForm";
import type { MemberRole } from "@/server/models/OrganizationMember";

export default async function KitchenSettingsPage() {
  // Resolve the caller's role server-side so the form can disable owner-only
  // controls (currently: the "Week start" select). This matches the rest of
  // the dashboard which threads server-resolved data into client components
  // via props rather than a second TanStack query.
  const [{ userId }, result] = await Promise.all([
    auth(),
    getKitchenConfig(),
  ]);
  const initialConfig = result.success ? result.data : null;

  let currentRole: MemberRole = "staff";
  if (userId) {
    const ctx = await getLocationContext(userId);
    // The settings layout admits shift leads for the notifications page.
    ensureRole(ctx, ["owner", "manager"]);
    currentRole = ctx.role;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Kitchen Settings</h1>
        <p className="text-muted-foreground">
          Configure stations, roles, and operating hours.
        </p>
      </div>
      <KitchenConfigForm
        initialConfig={initialConfig}
        currentRole={currentRole}
      />
    </div>
  );
}
