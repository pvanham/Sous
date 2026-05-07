import { listLaborRequirements } from "@/server/actions/labor-requirement.actions";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { LaborGrid } from "./_components/LaborGrid";
import Link from "next/link";
import { ClipboardList } from "lucide-react";

export default async function LaborPage() {
  // Fetch initial data in parallel
  const [requirementsResult, configResult] = await Promise.all([
    listLaborRequirements(),
    getKitchenConfig(),
  ]);

  // Extract data with defaults
  const initialRequirements = requirementsResult.success
    ? requirementsResult.data
    : [];
  const initialConfig = configResult.success ? configResult.data : null;

  // Check if kitchen is configured
  const hasStations = initialConfig && initialConfig.stations.length > 0;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background/50 px-6 py-4 shadow-sm backdrop-blur-xl sm:px-8 sm:py-5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 opacity-70" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
                Shift Slots
              </h1>
              <p className="text-sm text-muted-foreground">
                Define the shifts you need filled each week. The schedule generator will assign staff to these slots.
              </p>
            </div>
          </div>
        </div>
      </div>

      {!hasStations ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <h3 className="text-lg font-medium">No Stations Configured</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            You need to configure your kitchen stations before defining shift
            slots.
          </p>
          <Link
            href="/dashboard/settings"
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            Go to Settings
          </Link>
        </div>
      ) : (
        <LaborGrid
          initialRequirements={initialRequirements}
          initialConfig={initialConfig}
        />
      )}
    </div>
  );
}
