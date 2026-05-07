import type { QuietHoursPrefs } from "@sous/types";

/**
 * Decide whether `now` falls inside the user's stored quiet-hours
 * window.
 *
 * The function is intentionally pure (no Mongo, no Clerk, no logger
 * imports) so it can be unit-tested standalone — see
 * `scripts/test-quiet-hours.ts`. The dispatcher re-exports it so
 * call sites can import either path.
 *
 * Semantics:
 *   - `null` or `enabled: false` → never silence.
 *   - `start < end` → simple half-open `[start, end)` window.
 *   - `start > end` → wraps midnight (e.g. 22:00 → 07:00).
 *   - `start === end` → zero-length window, never silence.
 *   - Invalid timezone → log and fall through (false), so a malformed
 *     record can't silently swallow every notification.
 */
export function inQuietHours(
  now: Date,
  quietHours: QuietHoursPrefs,
): boolean {
  if (!quietHours || !quietHours.enabled) return false;
  const tz = quietHours.timezone;
  if (!tz) return false;

  let minutes: number;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    const parts = fmt.formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(
      parts.find((p) => p.type === "minute")?.value ?? "0",
    );
    minutes = (hour % 24) * 60 + (Number.isFinite(minute) ? minute : 0);
  } catch (err) {
    console.error("[notify] invalid timezone in quiet hours:", {
      timezone: tz,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }

  const { startMinute, endMinute } = quietHours;
  if (startMinute === endMinute) return false;
  if (startMinute < endMinute) {
    return minutes >= startMinute && minutes < endMinute;
  }
  return minutes >= startMinute || minutes < endMinute;
}
