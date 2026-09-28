import { cn } from "@/lib/utils";
import { getStationClasses } from "@/lib/utils/station-colors";

/**
 * Fictional week for the marketing page. Names, hours, and the
 * quality score are an illustration of the draft board — not a
 * customer, and not a measured result.
 */

type ShiftCell = {
  station: string;
  time: string;
};

type DayCell = ShiftCell | "off" | null;

type RosterRow = {
  name: string;
  role: string;
  days: DayCell[];
};

const DAYS = [
  { label: "Mon", date: "2" },
  { label: "Tue", date: "3" },
  { label: "Wed", date: "4" },
  { label: "Thu", date: "5" },
  { label: "Fri", date: "6" },
  { label: "Sat", date: "7" },
  { label: "Sun", date: "8" },
] as const;

const ROSTER: RosterRow[] = [
  {
    name: "Andre Ruiz",
    role: "Grill",
    days: [
      { station: "Grill", time: "10a–4p" },
      { station: "Grill", time: "10a–4p" },
      { station: "Grill", time: "4p–10p" },
      { station: "Grill", time: "10a–4p" },
      { station: "Grill", time: "10a–4p" },
      null,
      null,
    ],
  },
  {
    name: "Maya Chen",
    role: "Sauté",
    days: [
      { station: "Sauté", time: "4p–10p" },
      { station: "Sauté", time: "4p–10p" },
      { station: "Sauté", time: "4p–10p" },
      { station: "Sauté", time: "4p–10p" },
      { station: "Sauté", time: "3p–10p" },
      null,
      null,
    ],
  },
  {
    name: "Jordan Okonkwo",
    role: "Prep",
    days: [
      { station: "Prep", time: "8a–2p" },
      { station: "Prep", time: "8a–2p" },
      null,
      { station: "Prep", time: "8a–2p" },
      { station: "Prep", time: "8a–2p" },
      { station: "Prep", time: "8a–2p" },
      null,
    ],
  },
  {
    name: "Luis Alvarez",
    role: "Expo",
    days: [
      { station: "Expo", time: "4p–10p" },
      { station: "Expo", time: "4p–10p" },
      "off",
      { station: "Expo", time: "4p–10p" },
      { station: "Expo", time: "4p–10p" },
      { station: "Expo", time: "4p–10p" },
      null,
    ],
  },
  {
    name: "Sam Patel",
    role: "Fry",
    days: [
      { station: "Fry", time: "11a–3p" },
      { station: "Fry", time: "11a–3p" },
      null,
      { station: "Fry", time: "11a–3p" },
      null,
      { station: "Fry", time: "11a–3p" },
      null,
    ],
  },
];

function ShiftChip({ station, time }: ShiftCell) {
  return (
    <div
      className={cn(
        "rounded border border-stone-300/60 px-1.5 py-1 dark:border-white/10",
        getStationClasses(station),
      )}
    >
      <div className="text-[10px] font-medium leading-none">{station}</div>
      <div className="mt-1 font-mono text-[10px] leading-none opacity-80">
        {time}
      </div>
    </div>
  );
}

export function ExampleSchedule() {
  return (
    <figure
      className="border border-border bg-card"
      aria-label="Example draft schedule for a fictional kitchen, North and Main, March 2 through 8."
    >
      <figcaption className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Example draft · not a customer
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-foreground">
            North & Main · Staff view
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">Mar 2–8</span>
          <span className="inline-flex items-center gap-1.5 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-amber-800 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
            Draft
          </span>
        </div>
      </figcaption>

      <div
        className="overflow-x-auto"
        tabIndex={0}
        aria-label="Example schedule. Scroll sideways on a small screen."
      >
        <div className="grid min-w-[44rem] grid-cols-[8.75rem_repeat(7,minmax(4.25rem,1fr))] gap-1 p-2 sm:p-3">
          <div />
          {DAYS.map((day) => (
            <div key={day.label} className="px-1 pb-1">
              <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {day.label}
              </div>
              <div className="font-mono text-xs text-foreground">{day.date}</div>
            </div>
          ))}

          {ROSTER.map((person) => (
            <div key={person.name} className="contents">
              <div className="flex min-h-11 flex-col justify-center border-r border-border/80 pr-2">
                <span className="truncate text-sm font-medium leading-tight text-foreground">
                  {person.name}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {person.role}
                </span>
              </div>
              {person.days.map((cell, index) => (
                <div
                  key={`${person.name}-${DAYS[index].label}`}
                  className="flex min-h-11 items-center"
                >
                  {cell === "off" ? (
                    <span className="inline-flex items-center bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                      Time off
                    </span>
                  ) : cell ? (
                    <ShiftChip station={cell.station} time={cell.time} />
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-border px-3 py-2.5 font-mono text-[11px] leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <p>
          <span className="text-foreground">137h</span>
          <span className="px-2 text-border">/</span>
          score 91 / 100
          <span className="px-2 text-border">/</span>
          not published
        </p>
        <p className="text-primary">Sam Patel is under the weekly minimum.</p>
      </div>
    </figure>
  );
}
