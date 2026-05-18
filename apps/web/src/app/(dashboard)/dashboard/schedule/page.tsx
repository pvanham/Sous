import { getWeekStart } from "@/lib/utils/date";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { ScheduleGrid } from "./_components/ScheduleGrid";

export default async function SchedulePage() {
  // Server-side resolution of the location's week-start anchor so the
  // initial render lines up with the configured value before TanStack
  // Query has the kitchen config in cache. The client component still
  // reads the value from the cached query for subsequent paints.
  const configResult = await getKitchenConfig();
  const weekStartsOn =
    configResult.success && configResult.data
      ? configResult.data.weekStartsOn
      : "monday";
  const initialWeek = getWeekStart(new Date(), weekStartsOn);

  return <ScheduleGrid initialWeek={initialWeek} initialWeekStartsOn={weekStartsOn} />;
}
