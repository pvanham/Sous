import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { AISettingsForm } from "../_components/AISettingsForm";
import type { AISettingsDTO } from "@/types/kitchen-config";

export default async function AISettingsPage() {
  const result = await getKitchenConfig();
  const initialAISettings: AISettingsDTO | null =
    result.success && result.data ? result.data.aiSettings : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Settings</h1>
        <p className="text-muted-foreground">
          Configure schedule generation limits and subscription tier.
        </p>
      </div>
      <AISettingsForm initialSettings={initialAISettings} />
    </div>
  );
}
