# 10 — Notifications (Push + Email)

> Single source of truth for how Sous decides what to notify, who to
> notify, and over which channel. Covers the dispatcher, the per-user
> preferences, the per-device push registration, and every event site
> that calls into it.

The notification system has three responsibilities and exactly one
entry point:

1. **Resolve recipients** for a category (e.g. "all staff at this
   location", "the manager that approved this swap").
2. **Filter** them through their stored preferences (master switches,
   per-category × per-channel matrix, quiet hours).
3. **Fan out** to push (Expo) and email (Resend) transports without
   throwing back to the caller.

The single entry point is
`NotificationService.notify(...)` (see
`apps/web/src/server/services/notification.service.ts`). Every trigger
site goes through the helpers in
`apps/web/src/server/services/notification-events.ts` rather than
calling `notify` directly — the helpers own per-category copy so
identical events render identically across the app.

---

## 1. Categories

Twelve categories, kept in sync between
`packages/types/src/validations/notification.schema.ts`,
`apps/web/src/server/services/notification-events.ts`, and this
document. Adding a category means updating all three plus the mobile
settings screen.

| Category | Audience | Trigger site |
|----------|----------|--------------|
| `schedule_published` | All active staff at the location | `publishSchedule` action |
| `schedule_unpublished` | All active staff at the location | `updateScheduleStatus` action (PUBLISHED → DRAFT) |
| `shift_assignment_changed` | The affected staff member(s) | `shift.actions.{create,update,delete}` (only when schedule is published), AI orchestrator `executeShiftSwap` |
| `manager_coverage_gap` | Managers at the location | `publishSchedule` action when warnings exist |
| `time_off_submitted` | Managers at the location | `createTimeOffRequest` action + `POST /api/time-off` |
| `time_off_decision` | The requesting staff member | `updateTimeOffRequestStatus` action |
| `exchange_new_drop` | All active staff at the location | `ExchangeShiftService.drop` |
| `exchange_pending_approval` | Managers at the location | `ExchangeShiftService.pickup` |
| `exchange_decision` | Counterparties (dropper / picker) | `ExchangeShiftService.{approve,deny,cancel,cancelAsManager,withdrawPickup}` |
| `announcements` | All active staff at the location | `createAnnouncement` action |
| `schedule_generation_async` | The user that initiated the job | `GET /api/ai/tasks/[taskId]/status` on the transition to a terminal state |
| `billing_alerts` | All `owner`-role members of the org | `POST /api/webhooks/stripe` for completed checkout, cancellation, payment failure, and "set to cancel" |

---

## 2. The dispatcher

### 2.1 Contract

`NotificationService.notify({ recipients, category, payload, orgId?,
locationId? })` is **fire-and-forget**. It:

- Returns `Promise<void>` and **never throws** — every transport
  failure is logged with a structured prefix (`[notify] …`) so
  triage stays grep-friendly.
- Resolves `recipients` to a deduplicated `Set<string>` of Clerk user
  ids. `staffIds` is intentionally not implemented today; pass
  `clerkUserIds` instead.
- Loads each recipient's `NotificationPreference` in parallel (lazily
  seeded with defaults if it doesn't exist).
- Drops anyone whose master switch for the channel is off, whose
  per-category override for the channel is `false`, or who is inside
  their quiet-hours window.
- Pushes the surviving payloads through the two transport adapters in
  parallel.

Every call site uses `void` (or, in actions, plain await) to honour
the fire-and-forget contract. A Mongo / Clerk / Resend / Expo outage
**must not** roll back the originating business action.

### 2.2 Recipient selectors

```ts
interface RecipientSelector {
  clerkUserIds?: readonly string[];
  staffIds?: readonly string[];                 // not implemented; warns
  managersOf?:   { orgId: string; locationId: string };  // owner|manager|shift_lead
  allStaffOf?:   { orgId: string; locationId: string };  // active + clerk-linked
  ownerOf?:      { ownerClerkUserId: string };
}
```

Selectors are additive — pass several to deliver to the union (e.g. a
swap decision notifies both counterparties via `clerkUserIds`).

### 2.3 Quiet hours

`apps/web/src/lib/notifications/quiet-hours.ts` exports the pure
`inQuietHours(now, prefs)` helper used by the dispatcher. The
function is deliberately framework-free so a unit test can run it
under `tsx` without booting Mongo or Clerk; see
`scripts/test-quiet-hours.ts`.

Semantics (also encoded in the test):

- `null` or `enabled: false` → never silence.
- `start < end` → simple half-open `[start, end)` window.
- `start > end` → wraps midnight (e.g. 22:00 → 07:00).
- `start === end` → zero-length window, never silence.
- Invalid timezone → log + return false (we'd rather over-deliver
  than swallow every notification because of a malformed record).

---

## 3. Transports

### 3.1 Expo push (`apps/web/src/lib/push/expo-push.ts`)

Wraps the Expo Push Service. Sends in chunks of 100, polls receipts
for `DeviceNotRegistered` errors, and soft-revokes dead tokens via
`DeviceTokenService.revoke`. Honours `EXPO_ACCESS_TOKEN` if set
(raises Expo's anonymous rate limit; not strictly required for
correctness).

### 3.2 Resend email (`apps/web/src/lib/email/resend.ts`)

Lazily instantiates the Resend client. Renders React-email components
via `@react-email/render`, then sends in batches with a concurrency
limit so a sudden burst (e.g. 80-staff schedule_published) cannot
saturate the Resend per-second cap.

All emails go through `NotificationEmail.tsx` — a single template
parameterised on `preview / heading / paragraphs / cta`. Per-category
copy is owned by `notification-events.ts`, not the template.

Required env vars: `RESEND_API_KEY`, `RESEND_FROM`. When unset the
adapter no-ops every send and logs a single warning per process — push
keeps working independently.

---

## 4. Mobile registration & sign-out

`apps/mobile/lib/notifications.ts` is the single owner of every Expo
side effect on the client:

- `setNotificationHandler` → foreground policy (banner + sound, no
  badge).
- `ensureAndroidChannel("default")` on Android.
- `ensurePermission()` requests the OS prompt the first time, then
  honours user-settings on subsequent launches.
- `getExpoPushTokenAsync({ projectId })` → reads `Constants.expoConfig.
  extra.eas.projectId`. Required by SDK 49+.
- `registerDeviceToken({ expoPushToken, platform, deviceName })` →
  `POST /api/me/notifications/devices`.

The registration call is fired from `app/_layout.tsx` once
`AuthGate` confirms a Clerk JWT and a membership row. Doing it from
the layout (rather than per-screen) means the prompt fires exactly
once per launch and never before the API client has a token.

`useSignOut` (`apps/mobile/features/auth/use-sign-out.ts`) calls
`unregisterDeviceForCurrentUser` **before** `Clerk.signOut()`. The
order matters: the revoke endpoint requires a valid Clerk session.

`attachNotificationTapHandler` is wired in the same layout. The
listener reads `data.url` (e.g. `sous://schedule`) from the push
payload and hands it to `Linking.openURL`, which Expo Router
resolves to a `router.push(...)`.

Announcement push payloads may set `data.url =
sous://announcements/<announcementId>` so a tap opens the dedicated
mobile detail screen (`app/announcements/[id].tsx`) directly.

---

## 5. Mobile UI

`apps/mobile/features/notifications/` owns:

- `api.ts` — REST glue for the four endpoints above.
- `hooks.ts` — `useNotificationPreferencesQuery` +
  `useUpdateNotificationPreferencesMutation`. The mutation is
  optimistic with a `mergePreferencesPatch` helper that mirrors the
  server-side merge in `NotificationPreferenceService.update`, so
  toggling a switch flips the UI before the request lands.
- `(no screens — the screen lives at
  `features/settings/screens/notifications-screen.tsx`)`

The settings screen renders three sections — **Channels**,
**Quiet hours**, and the per-category × per-channel **matrix**.
Manager-only categories (`time_off_submitted`,
`exchange_pending_approval`, `manager_coverage_gap`,
`schedule_generation_async`, `billing_alerts`) are filtered out for
staff-role members, since the dispatcher would never deliver them
anyway.

`features/settings/preferences-store.ts` was trimmed in v2 of the
zustand persisted blob — the only remaining device-local key is
`theme`. The migration is forgiving: if the persisted shape looks
malformed the screen falls back to system theme rather than crashing.

---

## 6. Adding a new category

1. Append the literal to `notificationCategoryValues` in
   `packages/types/src/validations/notification.schema.ts`. Re-build
   types automatically (no extra step — Next.js + tsx pick them up).
2. Update the `for` loop in `defaultNotificationPreferences()`
   (`packages/types/src/index.ts`) so every freshly-seeded user
   document includes the new key with both channels on.
3. Add a builder in
   `apps/web/src/server/services/notification-events.ts` that
   constructs the title / body / push data / email subject for the
   category. Do not call `NotificationService.notify` directly from a
   trigger site.
4. Wire the builder into the trigger site (server action / service /
   route handler / webhook). Use `void` to keep the original action
   non-blocking.
5. Add the row to the per-category matrix in
   `apps/mobile/features/settings/screens/notifications-screen.tsx`,
   marking it `managerOnly: true` if the dispatcher only delivers it
   to manager-equivalent roles.
6. Update the table in §1 of this document.

---

## 7. Manual smoke checklist

The automated suite covers `inQuietHours` only. Push and email
delivery are intentionally out-of-band — we'd rather catch a Resend
domain misconfiguration during release prep than mock around it.

Before shipping a change to the dispatcher or any category builder,
run through the following on at least one device:

- **iOS dev build (rebuild required after the `expo-notifications`
  plugin or icon changes):**
  1. Sign in.
  2. Accept the notification permission prompt.
  3. Trigger the category from the web app (e.g. publish a schedule).
  4. Confirm the push lands and tapping it deep-links into the
     correct tab.
- **Android dev build (APK from the `development` EAS profile):**
  Same four steps. Confirm the notification icon renders in the
  status bar (monochrome, not a grey square).
- **Email via Resend:**
  Set `RESEND_API_KEY` to a sandbox key and `RESEND_FROM` to
  `"Sous <onboarding@resend.dev>"`. Trigger any category and confirm
  the message arrives at the recipient's primary email on Clerk.
- **Quiet hours:**
  In the mobile settings screen, set the window to "now ± 5 minutes"
  in your local timezone and trigger a category. Confirm push is
  suppressed; confirm email is also suppressed (quiet hours apply to
  both channels).
- **Cross-org isolation:**
  Sign in as a user with memberships in two organizations. Trigger
  `schedule_published` in one org. Confirm the user only receives
  the notification once and that no users in the other org are
  affected.

---

## 8. Files to know

- `apps/web/src/server/services/notification.service.ts` — dispatcher.
- `apps/web/src/server/services/notification-events.ts` — per-category
  payload builders.
- `apps/web/src/lib/notifications/quiet-hours.ts` — pure, testable
  timezone helper.
- `apps/web/src/lib/push/expo-push.ts` — Expo transport adapter.
- `apps/web/src/lib/email/resend.ts` — Resend transport adapter.
- `apps/web/src/lib/email/templates/NotificationEmail.tsx` — single
  parameterised React-email template.
- `apps/web/src/server/models/NotificationPreference.ts`
- `apps/web/src/server/models/DeviceToken.ts`
- `apps/web/src/server/services/notification-preference.service.ts`
- `apps/web/src/server/services/device-token.service.ts`
- `apps/web/src/app/api/me/notifications/preferences/route.ts`
- `apps/web/src/app/api/me/notifications/devices/route.ts`
- `apps/mobile/lib/notifications.ts`
- `apps/mobile/features/notifications/api.ts`
- `apps/mobile/features/notifications/hooks.ts`
- `apps/mobile/features/settings/screens/notifications-screen.tsx`
- `scripts/test-quiet-hours.ts`
