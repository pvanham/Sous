import { listTimeOffRequests } from "@/server/actions/time-off-request.actions";
import { listStaff } from "@/server/actions/staff.actions";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { TimeOffRequestTable } from "./_components/TimeOffRequestTable";
import { CalendarOff } from "lucide-react";

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
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background/50 px-6 py-4 shadow-sm backdrop-blur-xl sm:px-8 sm:py-5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 opacity-70" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md">
              <CalendarOff className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
                Time Off Requests
              </h1>
              <p className="text-sm text-muted-foreground">
                Review and manage staff time-off requests.
              </p>
            </div>
          </div>
        </div>
      </div>

      <TimeOffRequestTable
        initialRequests={initialRequests}
        initialStaff={initialStaff}
        minAdvanceDays={minAdvanceDays}
      />
    </div>
  );
}
