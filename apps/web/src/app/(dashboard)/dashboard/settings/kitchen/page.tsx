import { auth } from "@clerk/nextjs/server";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
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
    const membership =
      await OrganizationMemberService.getFirstByUserId(userId);
    if (membership) currentRole = membership.role;
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
