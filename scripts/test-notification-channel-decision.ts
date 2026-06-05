/**
 * Notification channel-routing smoke test.
 *
 * Exercises `resolveChannelDecision()` from the dispatcher — the pure
 * helper that decides, per recipient, whether a notification goes out
 * over push and/or email. The interesting behaviour added in SHI-48 is
 * that **email** for manager/owner-facing ("web") categories is gated
 * by the *separate* web preferences, while push and every other
 * category's email stay on the mobile matrix.
 *
 * No DB or network is required. The helper is imported directly so a
 * future refactor that breaks the routing rules surfaces here before it
 * ships.
 *
 * Usage (from the repo root):
 *   cd apps/web && npx tsx ../../scripts/test-notification-channel-decision.ts
 */

import {
  resolveChannelDecision,
  isWebEmailCategory,
} from "../apps/web/src/lib/notifications/channel-decision";
import {
  defaultNotificationPreferences,
  defaultWebNotificationPreferences,
} from "@sous/types";
import type {
  NotificationCategory,
  NotificationPreferencesDTO,
  WebNotificationPreferencesDTO,
} from "@sous/types";

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

function mobile(): NotificationPreferencesDTO {
  return {
    ...defaultNotificationPreferences("user_test"),
    updatedAt: new Date(),
  };
}

function web(): WebNotificationPreferencesDTO {
  return {
    ...defaultWebNotificationPreferences("user_test"),
    updatedAt: new Date(),
  };
}

const NOW = new Date();
const WEB_CATEGORY: NotificationCategory = "time_off_submitted";
const STAFF_CATEGORY: NotificationCategory = "time_off_decision";

function main(): void {
  console.log("Category classification");
  assert(isWebEmailCategory("time_off_submitted"), "time_off_submitted is web");
  assert(isWebEmailCategory("billing_alerts"), "billing_alerts is web");
  assert(
    !isWebEmailCategory("time_off_decision"),
    "time_off_decision is NOT web",
  );
  assert(
    !isWebEmailCategory("schedule_published"),
    "schedule_published is NOT web",
  );

  console.log("\nWeb category email is gated by WEB prefs, not mobile");
  {
    // Mobile says email OFF for the category, but web says ON → email ON.
    const mp = mobile();
    mp.categories[WEB_CATEGORY] = { push: true, email: false };
    const d = resolveChannelDecision({
      category: WEB_CATEGORY,
      mobilePrefs: mp,
      webPrefs: web(),
      now: NOW,
    });
    assert(d.wantsEmail, "mobile email off + web on → email ON");
    assert(d.wantsPush, "push still follows mobile (on)");
  }
  {
    // Web category OFF on web → email OFF even though mobile email is ON.
    const wp = web();
    wp.categories[WEB_CATEGORY] = false;
    const d = resolveChannelDecision({
      category: WEB_CATEGORY,
      mobilePrefs: mobile(),
      webPrefs: wp,
      now: NOW,
    });
    assert(!d.wantsEmail, "web category off → email OFF");
    assert(d.wantsPush, "push unaffected by web prefs");
  }
  {
    // Master web email OFF → email OFF for every web category.
    const wp = web();
    wp.email = false;
    const d = resolveChannelDecision({
      category: WEB_CATEGORY,
      mobilePrefs: mobile(),
      webPrefs: wp,
      now: NOW,
    });
    assert(!d.wantsEmail, "master web email off → email OFF");
  }

  console.log("\nQuiet hours does NOT silence web email");
  {
    const mp = mobile();
    mp.quietHours = {
      enabled: true,
      startMinute: 0,
      endMinute: 24 * 60, // all day
      timezone: "UTC",
    };
    const d = resolveChannelDecision({
      category: WEB_CATEGORY,
      mobilePrefs: mp,
      webPrefs: web(),
      now: NOW,
    });
    assert(d.wantsEmail, "web email ignores quiet hours");
    assert(!d.wantsPush, "push IS silenced by quiet hours");
  }

  console.log("\nStaff (non-web) category email still follows MOBILE prefs");
  {
    const mp = mobile();
    mp.categories[STAFF_CATEGORY] = { push: true, email: false };
    const d = resolveChannelDecision({
      category: STAFF_CATEGORY,
      mobilePrefs: mp,
      webPrefs: null,
      now: NOW,
    });
    assert(!d.wantsEmail, "mobile email off → email OFF for staff category");
  }
  {
    // Even if a (defensive) web prefs object is passed for a non-web
    // category, the mobile matrix governs email.
    const mp = mobile();
    mp.channels.email = false;
    const d = resolveChannelDecision({
      category: STAFF_CATEGORY,
      mobilePrefs: mp,
      webPrefs: web(),
      now: NOW,
    });
    assert(
      !d.wantsEmail,
      "staff category ignores web prefs; mobile master off → email OFF",
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
