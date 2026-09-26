import { getWeekStart } from "@/lib/utils/date";
import { getCurrentWeekStart } from "@/server/actions/schedule.actions";
import { ScheduleGrid } from "./_components/ScheduleGrid";

export default async function SchedulePage() {
  // Server-side resolution of the location's week-start anchor so the
  // initial render lines up with the configured value before TanStack
  // Query has the kitchen config in cache. The client component still
  // reads the value from the cached query for subsequent paints.
  //
  // The anchor is computed in the location's timezone (not the server's)
  // so a UTC deployment serving a non-UTC kitchen still lands on the same
  // week boundary the schedule docs were stored under.
  const weekResult = await getCurrentWeekStart();
  const weekStartsOn = weekResult.success ? weekResult.data.weekStartsOn : "monday";
  const initialWeek = weekResult.success
    ? weekResult.data.weekStart
    : getWeekStart(new Date(), weekStartsOn);

  return <ScheduleGrid initialWeek={initialWeek} initialWeekStartsOn={weekStartsOn} />;
}
