import { listTimeOffRequests } from "@/server/actions/time-off-request.actions";
import { listStaff } from "@/server/actions/staff.actions";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { TimeOffRequestTable } from "./_components/TimeOffRequestTable";

export default async function TimeOffPage() {
  // Fetch initial data in parallel
  const [requestsResult, staffResult, configResult] = await Promise.all([
    listTimeOffRequests(),
    listStaff(),
    getKitchenConfig(),
  ]);

  // Extract data with defaults
  const initialRequests = requestsResult.success ? requestsResult.data : [];
  const initialStaff = staffResult.success ? staffResult.data : [];
  const minAdvanceDays =
    configResult.success && configResult.data
      ? configResult.data.minTimeOffAdvanceDays
      : 7;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Time Off Requests
        </h1>
        <p className="text-muted-foreground">
          Review and manage staff time-off requests.
        </p>
      </div>

      <TimeOffRequestTable
        initialRequests={initialRequests}
        initialStaff={initialStaff}
        minAdvanceDays={minAdvanceDays}
      />
    </div>
  );
}
