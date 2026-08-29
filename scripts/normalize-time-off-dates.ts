/**
 * Migration Script: TimeOffRequest.startDate / endDate → UTC midnight
 *
 * Time-off start and end dates are calendar days, but the two clients
 * used to disagree about which instant represents a given day:
 *
 *   - The web dashboard's `<input type="date">` produced "2026-09-20",
 *     which `z.coerce.date()` turned into 2026-09-20T00:00:00.000Z.
 *   - The mobile date picker sent a local-midnight `Date`, which Axios
 *     serialized with the device offset — 2026-09-20T04:00:00.000Z from
 *     an America/New_York phone.
 *
 * Both clients now send "YYYY-MM-DD" and the shared schema normalizes to
 * UTC midnight. This script brings existing rows onto that convention so
 * the UI (which now renders in UTC) shows the day that was intended.
 *
 * Inferring the intended day:
 *
 *   - A value already at exactly T00:00:00.000Z came from the web and
 *     names its own UTC calendar day. Left untouched.
 *   - Anything else is read as local midnight and interpreted in the
 *     owning `Location.timezone`, which recovers the submitted day for
 *     any device whose timezone matches its restaurant's. A staff member
 *     who submitted while travelling across timezones could still land a
 *     day off; the dry-run prints every rewrite so those can be spotted.
 *
 * The script is **idempotent** — after a successful run every value sits
 * at UTC midnight, so a second run reports zero changes.
 *
 * Two run modes:
 *
 *   npx tsx scripts/normalize-time-off-dates.ts             # dry-run (default)
 *   npx tsx scripts/normalize-time-off-dates.ts --apply     # writes
 *
 * Required env (read from `apps/web/.env.local`):
 *   - MONGODB_URI            Mongo Atlas connection string
 *
 * IMPORTANT: Back your database up before passing `--apply`.
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ENV_PATH = path.resolve(__dirname, "..", "apps", "web", ".env.local");
dotenv.config({ path: WEB_ENV_PATH });

import mongoose from "mongoose";
import Location from "../apps/web/src/server/models/Location";
import TimeOffRequest from "../apps/web/src/server/models/TimeOffRequest";

const APPLY = process.argv.includes("--apply");
const FALLBACK_TIMEZONE = "America/New_York";
const MAX_PRINTED_ROWS = 50;

interface PendingChange {
  id: string;
  timezone: string;
  startFrom: Date;
  startTo: Date;
  endFrom: Date;
  endTo: Date;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      "MONGODB_URI is not set. Add it to apps/web/.env.local before running.",
    );
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected to ${maskUri(uri)}`);
  console.log(APPLY ? "Mode: APPLY (writes)" : "Mode: DRY-RUN (no writes)");

  const timezones = await loadLocationTimezones();
  console.log(`Loaded ${timezones.size} location timezone(s).`);

  const requests = await TimeOffRequest.find(
    {},
    { startDate: 1, endDate: 1, locationId: 1 },
  ).lean();
  console.log(`Scanning ${requests.length} time-off request(s).`);

  const changes: PendingChange[] = [];
  for (const request of requests) {
    const timezone =
      timezones.get(String(request.locationId)) ?? FALLBACK_TIMEZONE;
    const startTo = canonicalize(request.startDate, timezone);
    const endTo = canonicalize(request.endDate, timezone);

    if (
      startTo.getTime() === request.startDate.getTime() &&
      endTo.getTime() === request.endDate.getTime()
    ) {
      continue;
    }

    changes.push({
      id: String(request._id),
      timezone,
      startFrom: request.startDate,
      startTo,
      endFrom: request.endDate,
      endTo,
    });
  }

  console.log(`${changes.length} request(s) need normalizing.`);

  if (changes.length === 0) {
    console.log("Nothing to migrate — every value is already UTC midnight.");
    await mongoose.disconnect();
    return;
  }

  for (const change of changes.slice(0, MAX_PRINTED_ROWS)) {
    console.log(
      `  ${change.id} [${change.timezone}]\n` +
        `    start ${change.startFrom.toISOString()} -> ${change.startTo.toISOString()}\n` +
        `    end   ${change.endFrom.toISOString()} -> ${change.endTo.toISOString()}`,
    );
  }
  if (changes.length > MAX_PRINTED_ROWS) {
    console.log(`  ... and ${changes.length - MAX_PRINTED_ROWS} more.`);
  }

  if (!APPLY) {
    console.log("Re-run with --apply to write these values.");
    await mongoose.disconnect();
    return;
  }

  const result = await TimeOffRequest.bulkWrite(
    changes.map((change) => ({
      updateOne: {
        filter: { _id: change.id },
        update: {
          $set: { startDate: change.startTo, endDate: change.endTo },
        },
      },
    })),
  );

  console.log(
    `Migration complete — matched: ${result.matchedCount}, modified: ${result.modifiedCount}.`,
  );

  const remaining = await countNonCanonical(timezones);
  if (remaining !== 0) {
    console.error(
      `Migration incomplete: ${remaining} request(s) still off UTC midnight.`,
    );
    await mongoose.disconnect();
    process.exit(2);
  }

  await mongoose.disconnect();
}

async function loadLocationTimezones(): Promise<Map<string, string>> {
  const locations = await Location.find({}, { timezone: 1 }).lean();
  const map = new Map<string, string>();
  for (const location of locations) {
    map.set(String(location._id), location.timezone || FALLBACK_TIMEZONE);
  }
  return map;
}

async function countNonCanonical(
  timezones: Map<string, string>,
): Promise<number> {
  const requests = await TimeOffRequest.find(
    {},
    { startDate: 1, endDate: 1, locationId: 1 },
  ).lean();
  return requests.filter((request) => {
    const timezone =
      timezones.get(String(request.locationId)) ?? FALLBACK_TIMEZONE;
    return (
      canonicalize(request.startDate, timezone).getTime() !==
        request.startDate.getTime() ||
      canonicalize(request.endDate, timezone).getTime() !==
        request.endDate.getTime()
    );
  }).length;
}

/**
 * Resolve a stored instant to UTC midnight of the calendar day it was
 * meant to name. Values already at UTC midnight are returned unchanged.
 */
function canonicalize(value: Date, timezone: string): Date {
  if (isUtcMidnight(value)) return value;
  const [year, month, day] = calendarDayInTz(value, timezone);
  return new Date(Date.UTC(year, month - 1, day));
}

function isUtcMidnight(value: Date): boolean {
  return (
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  );
}

/** Year, month (1-12) and day of `value` as read in `timezone`. */
function calendarDayInTz(
  value: Date,
  timezone: string,
): [number, number, number] {
  // "en-CA" formats as YYYY-MM-DD, which needs no part-by-part assembly.
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  const [year, month, day] = iso.split("-").map(Number);
  return [year, month, day];
}

function maskUri(uri: string): string {
  return uri.replace(/:[^:@/]+@/, ":***@");
}

main().catch(async (err) => {
  console.error("Migration failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore disconnect errors during failure path */
  }
  process.exit(1);
});
