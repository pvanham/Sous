import { auth } from "@clerk/nextjs/server";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { ensureRole } from "@/lib/auth/guards";
import { ScheduleGenerationSettingsForm } from "../_components/ScheduleGenerationSettingsForm";
import type { ScheduleGenerationSettingsDTO } from "@/types/kitchen-config";

export default async function ScheduleGenerationSettingsPage() {
  const { userId } = await auth();
  if (!userId) return null;

  // The settings layout admits shift leads for the notifications page.
  ensureRole(await getLocationContext(userId), ["owner", "manager"]);

  const result = await getKitchenConfig();
  const initialSettings: ScheduleGenerationSettingsDTO | null =
    result.success && result.data ? result.data.scheduleGenerationSettings : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Schedule Generation</h1>
        <p className="text-muted-foreground">
          Configure constraints used when generating schedules.
        </p>
      </div>
      <ScheduleGenerationSettingsForm initialSettings={initialSettings} />
    </div>
  );
}
