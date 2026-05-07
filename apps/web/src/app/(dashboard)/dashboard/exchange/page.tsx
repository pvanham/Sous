import { ArrowLeftRight } from "lucide-react";
import { listExchangeShiftsForManager } from "@/server/actions/exchange-shift.actions";
import { ExchangeBoard } from "./_components/ExchangeBoard";

export default async function ExchangePage() {
  // Fetch the full board on the server so the page hydrates with
  // initial data; the client re-fetches on mount through the same
  // action, scoped by the active status tab.
  const result = await listExchangeShiftsForManager({});
  const initialRows = result.success ? result.data : [];

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background/50 px-6 py-4 shadow-sm backdrop-blur-xl sm:px-8 sm:py-5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 opacity-70" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md">
              <ArrowLeftRight className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
                Shift Exchange
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage the staff drop-and-pick-up board. Approve pending
                coverage requests and review viability impact.
              </p>
            </div>
          </div>
        </div>
      </div>

      <ExchangeBoard initialRows={initialRows} />
    </div>
  );
}
