import { getWeekStart } from "@/lib/utils/date";
import { ScheduleGrid } from "./_components/ScheduleGrid";

export default function SchedulePage() {
  const initialWeek = getWeekStart(new Date());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Schedule</h1>
        <p className="text-muted-foreground">
          Manage weekly shift schedules for your team
        </p>
      </div>
      <ScheduleGrid initialWeek={initialWeek} />
    </div>
  );
}
