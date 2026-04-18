# 01 — Data Models

> Source of truth for every Mongoose schema that Sous persists to MongoDB
> Atlas. Models live in `apps/web/src/server/models/` and are imported
> **only** by services (see [02-layer-patterns.md](./02-layer-patterns.md)).

All tenant-scoped documents carry **`orgId`** and (where appropriate)
**`locationId`** as indexed `ObjectId` fields. Services must filter every
query by these identifiers; the client never supplies them.

---

## Identity & tenancy

### Organization (`Organization.ts`)

The tenant container. Owns one or more `Location`s and carries the
Stripe billing relationship for the tenant.

```ts
{
  ownerId: string,                     // Clerk user ID of the founding owner
  name: string,                        // 2–100 chars
  subscriptionTier: "free" | "pro" | "enterprise",   // default "free"
  stripeCustomerId?: string,           // sparse index
  stripeSubscriptionId?: string,       // sparse index
  cancelAtPeriodEnd?: boolean,
  currentPeriodEnd?: Date,
  createdAt, updatedAt: Date,
}
```

### Location (`Location.ts`)

A physical kitchen location within an organization. `timezone` is used
everywhere the AI orchestrator and scheduler need to render dates in
the restaurant's local wall-clock time.

```ts
{
  orgId: ObjectId(Organization),
  name: string,
  timezone: string,                    // IANA, e.g. "America/New_York"
  twilioPhoneNumber?: string,          // E.164, optional
  createdAt, updatedAt: Date,
}
```

### OrganizationMember (`OrganizationMember.ts`)

One row per (Clerk user, organization, optional location) relationship.
A row with `locationId: null` is **org-wide** — the user can switch
between locations via Clerk `publicMetadata.activeLocationId`, which
`getLocationContext` consults at request time.

```ts
{
  orgId: ObjectId(Organization),
  locationId: ObjectId(Location) | null,
  clerkUserId: string,
  role: "owner" | "manager" | "shift_lead" | "staff",
  createdAt, updatedAt: Date,
}
```

`MemberRole` drives the **RBAC allow-lists** consumed by the AI
orchestrator (`apps/web/src/lib/ai/rbac/permissions.ts`). Changes to
the role enum must be reflected there.

---

## Scheduling core

### KitchenConfig (`KitchenConfig.ts`)

Per-location restaurant settings — stations, roles, operating hours.
`stations` is the canonical list that every `Shift` validates against.

```ts
{
  orgId: ObjectId(Organization),
  locationId: ObjectId(Location),
  name: string,
  stations: string[],                  // e.g. ["Sauté", "Grill", "Prep", "Dish"]
  roles: string[],                     // e.g. ["Cook", "Shift Lead", "Manager"]
  operatingHours: {
    [day in "monday"..."sunday"]: {
      isOpen: boolean,
      open: string,                    // "HH:mm"
      close: string,                   // "HH:mm"
    },
  },
  createdAt, updatedAt: Date,
}
```

### Staff (`Staff.ts`)

The HR record for a person who works at a location. Linked to a Clerk
user (`clerkUserId`) once they accept an invitation and sign in to the
mobile app.

```ts
{
  orgId: ObjectId(Organization),
  locationId: ObjectId(Location),
  name: string,
  email: string,                       // lowercased, trimmed
  phone: string,                       // digits-only normalized
  roles: string[],                     // at least one
  skills: { station: string, proficiency: 1..5 }[],
  isActive: boolean,                   // default true
  maxHoursPerWeek: number,             // default 40, 0..168
  minHoursPerWeek: number,             // default 0
  preferredStations: string[],
  certifications: string[],
  hourlyRate: number,                  // used in labor-cost objective
  clerkUserId?: string | null,         // set when invitation is accepted
  invitationStatus: "not_invited" | "pending" | "accepted",
  createdAt, updatedAt: Date,
}
```

### Schedule (`Schedule.ts`)

Week container. `weekStartDate` is **always a Monday** (00:00 local).

```ts
{
  orgId: ObjectId(Organization),
  locationId: ObjectId(Location),
  weekStartDate: Date,                 // Monday 00:00 (location TZ)
  status: "DRAFT" | "PUBLISHED",
  notes: string,
  createdAt, updatedAt: Date,
}
```

### Shift (`Shift.ts`)

The atomic work assignment. Exactly one staff member per shift.

```ts
{
  orgId: ObjectId(Organization),
  locationId: ObjectId(Location),
  scheduleId: ObjectId(Schedule),
  staffId: ObjectId(Staff),
  start: Date,
  end: Date,
  station: string,                     // must match KitchenConfig.stations
  notes: string,
  createdAt, updatedAt: Date,
}
```

Invariants enforced by the `ShiftService`:

- `end > start`, duration ≤ 12 hours (Zod).
- No overlapping shifts for the same `staffId`
  (`ShiftService.checkOverlap`).
- Clopening gap (≥10h) is enforced by the CP solver at generation time,
  not by Mongo.

---

## Generation inputs

### LaborRequirement (`LaborRequirement.ts`)

The **demand** side of schedule generation — how many staff you need at
each station, at each time slot, on each day of the week.

```ts
{
  orgId: ObjectId(Organization),
  locationId: ObjectId(Location),
  dayOfWeek: 0..6,                     // 0 = Monday
  station: string,
  startTime: string,                   // "HH:mm"
  endTime: string,                     // "HH:mm"
  minStaff: number,
  preferredStaff: number,
  priority: "critical" | "high" | "normal" | "low",
  createdAt, updatedAt: Date,
}
```

### StaffAvailability (`StaffAvailability.ts`)

The **supply** side — when a staff member is normally available each
week.

```ts
{
  orgId: ObjectId(Organization),
  locationId: ObjectId(Location),
  staffId: ObjectId(Staff),
  dayOfWeek: 0..6,
  availableFrom: string,               // "HH:mm"
  availableTo: string,                 // "HH:mm"
  preference: "preferred" | "available" | "unavailable",
  createdAt, updatedAt: Date,
}
```

### TimeOffRequest (`TimeOffRequest.ts`)

Approved / pending PTO, one per requested range. The CP solver treats
`approved` requests as hard-exclude windows.

```ts
{
  orgId: ObjectId(Organization),
  locationId: ObjectId(Location),
  staffId: ObjectId(Staff),
  startDate: Date,
  endDate: Date,
  reason?: string,
  status: "pending" | "approved" | "denied",
  type?: "pto" | "sick" | "unpaid",   // mobile request modal sets this
  reviewedBy?: string,                 // Clerk user ID of reviewer
  reviewedAt?: Date,
  createdAt, updatedAt: Date,
}
```

`type` is optional on the document — legacy rows pre-dating the
mobile time-off submit flow do not carry it, and the manager-facing
Server Action does not yet expose a picker — but the DTO converter
defaults missing values to `"pto"` so consumers can always rely on a
concrete category. The CP solver does not consume this field; only
`status === "approved"` matters to scheduling.

---

## AI orchestrator state

### Conversation (`Conversation.ts`)

Embeds the full AI chat session — messages, tool calls, and proposals
— in a single document. This is intentional: it keeps the LLM's
context in one place and makes proposal lifecycle bookkeeping a
single-document update.

```ts
{
  orgId: ObjectId(Organization),
  locationId: ObjectId(Location),
  clerkUserId: string,
  isActive: boolean,
  messages: ConversationMessage[],     // embedded, in order
  createdAt, updatedAt: Date,
}

type ConversationMessage = {
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  timestamp: Date,
  toolCall?: { toolName, arguments, result },
  proposal?: StoredProposal,
}

type StoredProposal = {
  proposalId: string,
  toolName: string,                    // e.g. "propose_shift_swap"
  description: string,                 // user-facing summary
  payload: any,                        // execution-ready args (incl. OCC token)
  dataVersion: string,                 // OCC marker for the target aggregate
  status: "pending" | "approved" | "denied" | "expired" | "stale",
  createdAt: Date,
  resolvedAt?: Date,
  resolvedBy?: string,                 // Clerk user ID
}
```

Indexes: `(orgId, clerkUserId, isActive)` and `(updatedAt)`.

### AsyncTask (`AsyncTask.ts`)

Background work that exceeds the chat stream's `maxDuration`. Today
this is only `schedule_generation`, but the shape is generic.

```ts
{
  taskType: "schedule_generation",
  status: "pending" | "running" | "completed" | "failed" | "infeasible" | "timed_out",
  conversationId: string,              // references Conversation._id as string
  proposalId: string,                  // embedded StoredProposal.proposalId
  orgId: ObjectId(Organization),
  locationId: ObjectId(Location),
  clerkUserId: string,
  inputPayload: unknown,               // solver input snapshot
  scheduleId: string,
  weekStartDate: string,               // ISO date (Monday)
  result?: {
    solverStatus: string,
    objectiveValue: number,
    solveTimeMs: number,
    totalCostCents: number,
    fallbackRatesUsed: boolean,
    overtimeSummary: unknown,
    generatedDays: unknown[],
    summary: string,
    suggestedRelaxations?: unknown[],
    likelyCauses?: string[],
  },
  error?: { message: string, code?: string, details?: unknown },
  dispatchedAt?: Date,
  completedAt?: Date,
  deadline: Date,                      // for timeout reaping
  createdAt, updatedAt: Date,
}
```

Indexes: `(orgId, conversationId, status)`, `(status, deadline)`, `(proposalId)`.

### AIUsageLog (`AIUsageLog.ts`)

One row per non-chat LLM call (schedule generation, infeasibility
narratives). Feeds monthly usage limits via `ai-usage.service.ts`.

```ts
{
  orgId: ObjectId(Organization),
  clerkUserId: string,
  action: string,                      // e.g. "generate_schedule"
  model: string,                       // e.g. "gpt-4o"
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  durationMs: number,
  success: boolean,
  errorMessage?: string,
  createdAt: Date,
}
```

Chat usage is not currently metered here — the Vercel AI SDK's
`onFinish` callback in `/api/ai/chat/route.ts` is the extension point.

---

## Tenancy indexes — minimum bar

Every tenant-scoped collection carries at least:

- `{ orgId: 1, locationId: 1 }` (compound).
- Plus feature-specific indexes (e.g. `Shift.{ scheduleId: 1 }`,
  `Conversation.{ updatedAt: 1 }`).

When adding a new model, add the compound tenancy index in the schema
`index()` declarations, not via ad-hoc runtime code.

---

## Mobile-app-driven aggregates

These collections were introduced together to back the mobile app's
Home and Exchange tabs. The web app's authoring UI for them is not
yet implemented; the model + service + DTO surfaces are.

### Announcement (`Announcement.ts`)

Manager-authored posts visible on the mobile **Home** tab. Scoped per
location (an organization with multiple locations gets independent
feeds). Read-side is open to every member of the location; write-side
(create / update / delete) is restricted to `owner` and `manager`
roles in `announcement.actions.ts`.

```ts
{
  orgId: ObjectId(Organization),
  locationId: ObjectId(Location),
  authorClerkUserId: string,           // who posted (Clerk user ID)
  authorName: string,                  // snapshot at write time
  title: string,                       // 1..120 chars
  body: string,                        // 1..2000 chars
  priority: "urgent" | "high" | "normal" | "low",   // default "normal"
  expiresAt?: Date | null,             // when set, must be in the future
  createdAt, updatedAt: Date,
}
```

Indexes: `(orgId, locationId, createdAt)` for the newest-first feed
and `(orgId, locationId, expiresAt)` for the still-active filter.
We deliberately do **not** use a TTL index — `expiresAt` controls
visibility, not deletion, so the manager-side history outlives the
staff-facing window.

The DTO and Zod schemas live in `@sous/types`
(`AnnouncementDTO`, `AnnouncementPriority`,
`createAnnouncementSchema`, `updateAnnouncementSchema`,
`listAnnouncementsSchema`). The web wrapper at
`apps/web/src/types/announcement.ts` adds the Mongoose-flavoured
`IAnnouncement` interface and the `toAnnouncementDTO` converter.

### ExchangeShift (`ExchangeShift.ts`)

Drop / pickup record for the mobile **Exchange** tab. Each row is a
1-to-1 lifecycle wrapper around a single `Shift` — we modeled it as a
separate aggregate (rather than a status field on `Shift`) so the
weekly schedule view never has to know about exchange and so the
audit fields (`pickedUpByStaffId`, `approvedByClerkUserId`,
`approvedAt`, `reason`) live where they belong.

```ts
{
  orgId: ObjectId(Organization),
  locationId: ObjectId(Location),
  shiftId: ObjectId(Shift),            // source of truth for start/end/station
  scheduleId: ObjectId(Schedule),      // denormalised for cheap weekly views
  staffId: ObjectId(Staff),            // dropper
  droppedByName: string,               // snapshot for cheap rendering
  pickedUpByStaffId?: ObjectId(Staff) | null,
  pickedUpByName?: string | null,
  start, end: Date,                    // denormalised from Shift
  station: string,                     // denormalised from Shift
  status: "available" | "pending_coverage" | "covered"
        | "manager_approved" | "cancelled",
  reason: string,                      // optional dropper note (max 500)
  approvedByClerkUserId?: string | null,
  approvedAt?: Date | null,
  createdAt, updatedAt: Date,
}
```

Lifecycle (`ExchangeShiftStatus`):

- `available`        — dropped, awaiting pickup.
- `pending_coverage` — picked up; awaiting shift-lead / manager
                       approval (only when `KitchenConfig` requires
                       it). The underlying `Shift.staffId` is **not**
                       reassigned yet.
- `covered`          — picked up under a no-approval policy; the
                       underlying `Shift.staffId` has been swapped to
                       the picker.
- `manager_approved` — terminal status after a `pending_coverage`
                       approval. Distinguished from `covered` so
                       audit history is unambiguous.
- `cancelled`        — dropper rescinded the drop while still
                       `available`. Terminal.

Indexes:

- `(orgId, locationId, status, start)` — board pagination by status.
- `(orgId, locationId, staffId, createdAt)` — "my drops" list.
- Partial-unique `(shiftId)` filtered to
  `status ∈ {available, pending_coverage}` — guarantees a single
  open drop per shift while still allowing a fresh drop after a
  `cancelled` / `covered` row.

Concurrency: `ExchangeShiftService.pickup` and `.approve` use OCC
against `ExchangeShift.updatedAt` so two simultaneous pickups can
never both succeed; the loser sees a clean error (the route handler
maps it to HTTP 409). Eligibility checks (skill match, schedule
overlap) live in `CandidateService` and must be invoked by the
route handler before calling `pickup` — the service tier intentionally
stays narrow.

The DTO and Zod schemas live in `@sous/types` (`ExchangeShiftDTO`,
`ExchangeShiftStatus`, `dropShiftSchema`,
`pickupExchangeShiftSchema`, `listAvailableExchangeShiftsSchema`,
`listMyExchangeShiftsSchema`, `approveExchangeShiftSchema`,
`cancelExchangeShiftSchema`). The web wrapper at
`apps/web/src/types/exchange-shift.ts` adds the Mongoose-flavoured
`IExchangeShift` interface and `toExchangeShiftDTO` converter.

---

## Not yet modeled (Phase 5 / future)

SMS two-way messaging (`Message`, `CoverageRequest`) is on the roadmap
but **not implemented**. The archived plan lives at
`docs/history/roadmap/04-sms-automation.md`. Do not pre-emptively create
these models — add them only when the feature lands.
