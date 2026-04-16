import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { KitchenConfigForm } from "../_components/KitchenConfigForm";

export default async function KitchenSettingsPage() {
  const result = await getKitchenConfig();
  const initialConfig = result.success ? result.data : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Kitchen Settings</h1>
        <p className="text-muted-foreground">
          Configure stations, roles, and operating hours.
        </p>
      </div>
      <KitchenConfigForm initialConfig={initialConfig} />
    </div>
  );
}
