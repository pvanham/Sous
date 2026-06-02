# 02 — Layer Patterns (The 3-Layer Architecture)

> The single most important architectural rule in the codebase.
> Every read or write against MongoDB flows through **exactly three**
> server-side layers. This document is the authoritative explanation;
> the [`web-server-actions`](../../.cursor/rules/web-server-actions.mdc)
> rule is the concise, code-adjacent version.

---

## The layers

```
┌────────────────────────────────────────────────────────────────┐
│ UI LAYER                                                       │
│   apps/web/src/app/**, apps/web/src/components/**              │
│   - React Server Components (pages, layouts)                   │
│   - React Client Components (_components/*)                    │
│   - TanStack Query for reads / mutations                       │
│   - Zero Mongoose imports, zero business logic                 │
└─────────────────────────────┬──────────────────────────────────┘
                              │  calls Server Actions
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ ACTION LAYER                                                   │
│   apps/web/src/server/actions/*.actions.ts ("use server")      │
│   - auth() check                                               │
│   - Zod validation (input: unknown)                            │
│   - getLocationContext(userId)                                 │
│   - Delegates to one or more services                          │
│   - Returns ActionResponse<T> (never throws)                   │
└─────────────────────────────┬──────────────────────────────────┘
                              │  calls Services
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ SERVICE LAYER                                                  │
│   apps/web/src/server/services/*.service.ts                    │
│   - ONLY place Mongoose models are imported                    │
│   - Pure business logic (overlap, OCC, cost math)              │
│   - Always filters by orgId + locationId                       │
│   - Converts string IDs to Types.ObjectId internally           │
│   - Returns DTOs (never Mongoose documents)                    │
└─────────────────────────────┬──────────────────────────────────┘
                              │  model.X
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ MODEL LAYER                                                    │
│   apps/web/src/server/models/*.ts                              │
│   - Mongoose schemas + singleton model registration            │
│   - models.X || model("X", Schema) idiom for HMR safety        │
└────────────────────────────────────────────────────────────────┘
```

---

## The hard rules (non-negotiable)

1. **Models are imported only by services.** Not by actions, not by
   route handlers, not by components.
2. **Services are imported only by actions (or by other services).**
   Not by components, not by route handlers outside the AI surface.
3. **UI never imports anything from `src/server/`.** It goes through a
   Server Action or a Route Handler.
4. **Actions never throw.** They always return `ActionResponse<T>`:
   `{ success: true, data: T } | { success: false, error: string }`.
5. **Multi-tenancy is enforced in services.** Every query filters by
   `orgId` and (unless the aggregate is org-wide) `locationId`.
6. **No `fetch()` between server components and actions.** Import the
   action and call it. That's the whole point of RSC.

Skipping a layer is a bug, not a shortcut.

---

## Action anatomy (canonical shape)

```ts
"use server";

import { auth } from "@clerk/nextjs/server";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { ShiftService } from "@/server/services/shift.service";
import { createShiftSchema } from "@/lib/validations/shift.schema";
import type { ActionResponse } from "@/lib/safe-action";
import type { ShiftDTO } from "@/types/shift";

export async function createShift(
  input: unknown                                 // ALWAYS unknown
): Promise<ActionResponse<ShiftDTO>> {
  try {
    // 1. Auth
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    // 2. Validate
    const parsed = createShiftSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", "),
      };
    }

    // 3. Resolve tenancy (also calls dbConnect internally)
    const ctx = await getLocationContext(userId);

    // 4. Cross-aggregate business checks (still via services)
    // e.g. validate station against KitchenConfig

    // 5. Delegate
    const shift = await ShiftService.create({
      orgId: ctx.orgId,
      locationId: ctx.locationId,
      ...parsed.data,
    });

    // 6. Return DTO
    return { success: true, data: shift };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
```

**Active action files** (`apps/web/src/server/actions/`):

- `organization.actions.ts`, `location.actions.ts`, `user.actions.ts`
- `kitchen-config.actions.ts`
- `staff.actions.ts`, `staff-availability.actions.ts`
- `schedule.actions.ts`, `shift.actions.ts`,
  `schedule-generation.actions.ts`
- `labor-requirement.actions.ts`
- `time-off-request.actions.ts`
- `invitation.actions.ts` — Clerk invitations
  (`inviteManager` / `inviteStaffToApp`)

---

## Service anatomy

```ts
// src/server/services/shift.service.ts
import Shift from "@/server/models/Shift";
import { Types } from "mongoose";
import { toShiftDTO } from "@/types/shift";

export const ShiftService = {
  async create(data: CreateShiftInput): Promise<ShiftDTO> {
    const hasOverlap = await this.checkOverlap(/* … */);
    if (hasOverlap) throw new Error("Shift overlaps existing shift");

    const doc = await Shift.create({
      orgId: new Types.ObjectId(data.orgId),
      locationId: new Types.ObjectId(data.locationId),
      // …
    });
    return toShiftDTO(doc.toObject());
  },

  async checkOverlap(/* … */): Promise<boolean> { /* … */ },
};
```

**Active services** (`apps/web/src/server/services/`):

- Core: `organization.service.ts`, `location.service.ts`,
  `organization-member.service.ts`, `kitchen-config.service.ts`.
- Scheduling: `staff.service.ts`, `schedule.service.ts`,
  `shift.service.ts`, `staff-availability.service.ts`,
  `labor-requirement.service.ts`, `time-off-request.service.ts`.
- AI / solver: `ai/scheduling-agent.service.ts`,
  `candidate.service.ts`, `cp-solver.service.ts`,
  `schedule-validator.service.ts`.
- Cross-cutting: `ai-usage.service.ts`, `async-task.service.ts`.

### Service object conventions

- Exported as a `const` object with methods — **not** a class. This
  keeps import shapes predictable and method references tree-shakable.
- ID parameters are `string`; conversion to `Types.ObjectId` happens
  inside the method.
- Returns DTOs (`toXDTO(doc.toObject())`) — never `Mongoose.Document`.
- Throws `Error` on business-rule violations; actions catch and convert.
- List methods use `.lean()` when they don't need document methods.

---

## Tenant context — `getLocationContext`

`src/lib/auth/get-location-context.ts` is the one-stop function for
resolving **who** the caller is and **which tenant and location** they
should be scoped to. Every action calls it after `auth()`.

```ts
const ctx = await getLocationContext(clerkUserId);
// ctx: { orgId: string, locationId: string, role: MemberRole }
```

Behavior:

1. Look up the first `OrganizationMember` for the Clerk user.
2. If the membership is **location-specific**, return that `locationId`.
3. If the membership is **org-wide** (`locationId === null`):
   - Read `user.publicMetadata.activeLocationId` from Clerk — this is
     set by the `LocationSwitcher` UI when an owner/manager changes
     location.
   - If not set, fall back to the org's default location.
   - If the organization has no locations at all, throw (unrecoverable —
     contact support).
4. Return `{ orgId, locationId, role }`.
5. If no `OrganizationMember` exists yet, throw `NoMembershipError` so
   route/layout guards can redirect signed-in owners to `/onboarding`.

There is also `hasLocationAccess(clerkUserId, orgId, locationId)` for
explicit cross-location access checks (e.g. the AI orchestrator's
viewport verification).

**Rule:** `orgId` and `locationId` **must never** come from the client.
They come from this function. Always.

---

## DTOs & the `@sous/types` boundary

Every feature has a `types/<feature>.ts` file in the web app defining:

- The **DTO** (plain serializable shape).
- The **Input** types consumed by services.
- A `toXDTO(doc)` helper.

Shared DTOs — those the mobile app also consumes — live in
`packages/types/src/` and are imported via `@sous/types`. Prefer the
shared package whenever a type crosses app boundaries; duplicating types
between `apps/web/src/types/` and `apps/mobile/features/*/` is a bug
waiting to happen.

See [03-ui-and-state.md](./03-ui-and-state.md) for the frontend's Zod
and shared-schema story.

---

## Error handling contract

- Services **throw** for business-rule violations with a
  human-readable message.
- Actions **catch** and return
  `{ success: false, error: <message> }`.
- Unknown errors are **logged** and returned as
  `"An internal error occurred."` — never leak internals into the
  error string.
- UI surfaces `result.error` via `sonner` toasts or inline errors.

Because actions never throw, React Server Components don't need
`<ErrorBoundary>` wrappers around action call sites — the discriminated
return type forces the caller to handle the failure path.

---

## Testing surface

- **Unit tests** for services live alongside the service (or a
  `__tests__/` sibling). Use `mongodb-memory-server` or a disposable
  cluster — never the production Atlas.
- **Integration tests** for action flows live under `scripts/test-*.ts`
  and are invoked via `npm run test:phase-*` on the web workspace.
  These pre-date the modular architecture and are being retired as Jest
  / Vitest coverage grows; don't add new ones without a reason.

See [05-api-and-testing.md](./05-api-and-testing.md) for the webhook /
API testing story.

---

## Owner onboarding provisioning

Tenant creation for owner accounts is now an explicit, synchronous flow
through the onboarding wizard at `/onboarding`:

1. `provisionOrganizationAndLocation` creates `Organization`, first
   `Location`, and owner `OrganizationMember`.
2. `saveOnboardingKitchenConfig` stores week start + operating hours +
   roles/stations.
3. `saveOnboardingShiftSlots` seeds initial `LaborRequirement` rows.
4. `completeOnboarding` sets Clerk `publicMetadata.onboardingComplete`.

The Clerk webhook no longer auto-creates owner org/location records on
`user.created`; it only provisions invited members.

See [11-onboarding.md](./11-onboarding.md) for the full step-by-step
architecture.

---

## Adding a new feature — layer-by-layer checklist

1. **Shared Zod schema** in `packages/types/src/validations/<feature>.schema.ts`
   (or `apps/web/src/lib/validations/` if web-only).
2. **Mongoose model** at `apps/web/src/server/models/<Feature>.ts`, with
   `orgId` + `locationId` + `timestamps` + tenancy index.
3. **Service object** at `apps/web/src/server/services/<feature>.service.ts`,
   with CRUD + business methods that all return DTOs.
4. **Server action file** at `apps/web/src/server/actions/<feature>.actions.ts`,
   one exported async function per operation, following the 6-step shape.
5. **UI wiring** — import the action from a Client Component, drive it
   through TanStack Query's `useMutation` with optimistic updates where
   appropriate.
6. **Docs** — if the feature changes the architecture (new model, new
   service category), update this file and
   [01-data-models.md](./01-data-models.md). No doc needed for pure
   additions.
