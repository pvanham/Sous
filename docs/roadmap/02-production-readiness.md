# Roadmap — Production Readiness

> Forward-looking. The list of things that should land before we
> charge money in anger.

## Why

Phases 1–4 of the product shipped. The system works for the current
design-partner cohort. Before a paid public launch, a handful of
cross-cutting gaps need to close.

## Items

### 1. AI audit logging

The agentic AI can rewrite the schedule. Today, every approval
lives on the `Conversation.messages[]` subarray, which is great for
debugging one conversation but not for cross-org compliance queries.

**Done looks like:**

- A dedicated `AuditLog` model scoped by `orgId`/`locationId`,
  indexed by `(orgId, createdAt)`.
- Every proposal resolution (`approved`, `denied`, `stale`,
  `expired`) emits an entry.
- Every step-limit failure and every async-task terminal state emits
  an entry.
- Usage metering covers both chat (Vercel AI SDK) and one-shot
  (OpenAI npm) calls. Today only one-shot is wired.

See [`../history/ai-assistant-phases.md`](../history/ai-assistant-phases.md)
§ "Phase 5" for the original design.

### 2. Error and loading boundaries

The web app has no `error.tsx` or `loading.tsx` files. When a server
component throws, Next.js surfaces the default error screen. For
production:

- `apps/web/src/app/error.tsx` — root boundary with a generic
  "something went wrong, retry" affordance.
- `apps/web/src/app/(dashboard)/error.tsx` — dashboard-level
  boundary so one feature's failure doesn't tank the whole shell.
- `loading.tsx` skeletons for the heavy pages (schedule grid,
  staff list).

### 3. Observability

- Ship a logging prefix convention (already started:
  `[scheduling-agent]`, `[membership self-heal]`). Enforce in the
  conduct rule.
- Pick one of Sentry / Datadog / Logtail for production. Today we
  rely on Vercel logs.
- Surface solver latency and failure rate. `async-task.service.ts`
  is the natural emit point.

### 4. Health + runbook

- `/api/health` endpoint that proves DB + solver + Clerk are
  reachable.
- A short `docs/runbook.md` covering: how to roll back a deploy,
  how to expire stuck `AsyncTask`s, how to regenerate an
  organisation's seed data.

### 5. Mobile backend

Every endpoint the mobile app needs is now live on `apps/web`. See
the canonical mapping in
[`../architecture/08-mobile-architecture.md` § 10.1](../architecture/08-mobile-architecture.md).
This section is left in place as a cross-link reference; new mobile
work should extend that table and follow the
[API and testing](../architecture/05-api-and-testing.md) conventions
(Clerk auth, Zod validation, `getLocationContext`).

### 5a. Notification delivery

Push (Expo) and email (Resend) delivery shipped in May 2026. See
[`../architecture/10-notifications.md`](../architecture/10-notifications.md)
for the dispatcher contract, category taxonomy, and the manual
smoke checklist. Items still on the roadmap before this is "done"
in production:

- Verify a Resend sending domain (DKIM + SPF) and switch
  `RESEND_FROM` off the `onboarding@resend.dev` sandbox.
- Generate an `EXPO_ACCESS_TOKEN` and add it to the `WEB_*` env
  set on the production host so push receipt polling lifts off the
  anonymous rate limit.
- Run the on-device smoke matrix from §7 of the architecture doc
  (iOS dev build, Android dev APK, quiet hours, cross-org).
- Capture an alarm on the dispatcher's `[notify]` log lines via
  the same observability stack as item §3 above so a Resend or
  Expo outage surfaces without a user complaint.

### 6. Deployment hardening

- `.env.example` at repo root documenting `WEB_*` and `MOBILE_*`
  prefixed variables the `bootstrap-env` skill consumes.
- CI check that runs `setup-agent-envs.sh` with a canary fixture to
  catch regressions in the bootstrap script.
- Type-safe env loader (`apps/web/src/lib/env.ts`) that fails fast
  on boot if a required variable is missing.
- A documented Vercel deployment path including Clerk + Stripe +
  Mongo + solver wiring.

## Not on this list (on purpose)

- **Staff self-service portal** — shipped as the mobile app. See
  [`../architecture/08-mobile-architecture.md`](../architecture/08-mobile-architecture.md).
- **Granular RBAC** — shipped as `AIPermission` + `ROLE_PERMISSIONS`
  for AI tools. Server-action-level RBAC still relies on role
  checks inside actions, which is fine for the current surface.
- **Multi-location switcher** — not urgent. The foundation shipped
  in Phase 2.5; the UI can be added when a design partner needs it.
