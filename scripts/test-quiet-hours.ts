/**
 * Quiet-hours timezone smoke test.
 *
 * Exercises `inQuietHours()` from the notification dispatcher across
 * the awkward boundary cases that the unit tests in our other smoke
 * scripts deliberately avoid:
 *   - Same-day windows (e.g. 09:00 → 17:00 in Pacific time).
 *   - Midnight-wrapping windows (22:00 → 07:00).
 *   - Zero-length windows (start === end).
 *   - Missing / disabled / null configuration.
 *   - Invalid timezone strings.
 *
 * No DB or network is required. The script imports the dispatcher
 * directly so a future refactor that breaks the timezone math will
 * surface here before it ships.
 *
 * Usage (from the repo root):
 *   cd apps/web && npx tsx ../../scripts/test-quiet-hours.ts
 */

import { inQuietHours } from "../apps/web/src/lib/notifications/quiet-hours";
import type { QuietHoursPrefs } from "@sous/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}${detail ? `  — ${detail}` : ""}`);
  }
}

/**
 * Construct a UTC `Date` whose representation in the given timezone
 * lands exactly at `hour:minute`. We rely on `formatToParts` rather
 * than DST-fragile arithmetic so the test stays correct year-round.
 */
function dateAt(tz: string, hour: number, minute: number): Date {
  // Pick a known-safe day (mid-summer) to avoid spring-forward
  // weirdness; the only thing the test cares about is the wall-clock
  // hour the resulting Date renders to in `tz`.
  const probe = new Date(Date.UTC(2026, 5, 15, hour, minute));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(probe);
  const observedHour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const observedMinute = Number(
    parts.find((p) => p.type === "minute")?.value ?? 0,
  );
  // Compute the offset in minutes between the probe's UTC wall-clock
  // and what the timezone reports, then shift the probe so the
  // returned Date renders to the requested wall-clock locally.
  const offsetMinutes =
    (observedHour - hour) * 60 + (observedMinute - minute);
  return new Date(probe.getTime() - offsetMinutes * 60_000);
}

function main(): void {
  console.log("Quiet hours: same-day window (NYC 09:00–17:00)");
  const nycDay: QuietHoursPrefs = {
    enabled: true,
    timezone: "America/New_York",
    startMinute: 9 * 60,
    endMinute: 17 * 60,
  };
  assert(
    inQuietHours(dateAt("America/New_York", 12, 0), nycDay),
    "12:00 NYC is inside",
  );
  assert(
    !inQuietHours(dateAt("America/New_York", 8, 59), nycDay),
    "08:59 NYC is outside",
  );
  assert(
    inQuietHours(dateAt("America/New_York", 9, 0), nycDay),
    "09:00 NYC is the inclusive lower bound",
  );
  assert(
    !inQuietHours(dateAt("America/New_York", 17, 0), nycDay),
    "17:00 NYC is the exclusive upper bound",
  );

  console.log("\nQuiet hours: midnight-wrap (LA 22:00–07:00)");
  const laNight: QuietHoursPrefs = {
    enabled: true,
    timezone: "America/Los_Angeles",
    startMinute: 22 * 60,
    endMinute: 7 * 60,
  };
  assert(
    inQuietHours(dateAt("America/Los_Angeles", 23, 30), laNight),
    "23:30 LA is inside the wrap window",
  );
  assert(
    inQuietHours(dateAt("America/Los_Angeles", 0, 1), laNight),
    "00:01 LA is inside the wrap window",
  );
  assert(
    inQuietHours(dateAt("America/Los_Angeles", 6, 59), laNight),
    "06:59 LA is inside the wrap window",
  );
  assert(
    !inQuietHours(dateAt("America/Los_Angeles", 7, 0), laNight),
    "07:00 LA is the exclusive upper bound",
  );
  assert(
    !inQuietHours(dateAt("America/Los_Angeles", 21, 59), laNight),
    "21:59 LA is just before the window",
  );

  console.log("\nQuiet hours: cross-timezone respect (NYC user, UTC clock)");
  const sameNycNight: QuietHoursPrefs = {
    enabled: true,
    timezone: "America/New_York",
    startMinute: 22 * 60,
    endMinute: 7 * 60,
  };
  // 03:00 UTC during daylight saving is 23:00 NYC the previous day,
  // which is inside the configured 22:00–07:00 window.
  const utcMidnight = new Date(Date.UTC(2026, 5, 15, 3, 0));
  assert(
    inQuietHours(utcMidnight, sameNycNight),
    "03:00 UTC = 23:00 NYC, inside the window",
  );

  console.log("\nQuiet hours: degenerate cases");
  assert(!inQuietHours(new Date(), null), "null prefs return false");
  assert(
    !inQuietHours(new Date(), {
      enabled: false,
      timezone: "UTC",
      startMinute: 0,
      endMinute: 60,
    }),
    "disabled prefs return false",
  );
  assert(
    !inQuietHours(new Date(), {
      enabled: true,
      timezone: "UTC",
      startMinute: 600,
      endMinute: 600,
    }),
    "zero-length window returns false",
  );
  assert(
    !inQuietHours(new Date(), {
      enabled: true,
      timezone: "Not/A_Real_Zone",
      startMinute: 0,
      endMinute: 60,
    }),
    "invalid timezone returns false",
  );

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
