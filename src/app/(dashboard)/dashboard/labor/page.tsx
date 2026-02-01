import { listLaborRequirements } from "@/server/actions/labor-requirement.actions";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { LaborGrid } from "./_components/LaborGrid";
import Link from "next/link";

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Labor Requirements</h1>
        <p className="text-muted-foreground">
          Define staffing needs by station and day of the week.
        </p>
      </div>

      {!hasStations ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <h3 className="text-lg font-medium">No Stations Configured</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            You need to configure your kitchen stations before setting up labor
            requirements.
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
