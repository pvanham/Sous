import { getWeekStart } from "@/lib/utils/date";
import { ScheduleGrid } from "./_components/ScheduleGrid";

export default function SchedulePage() {
  const initialWeek = getWeekStart(new Date());

  return <ScheduleGrid initialWeek={initialWeek} />;
}
