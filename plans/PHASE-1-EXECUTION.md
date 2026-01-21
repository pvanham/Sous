# Phase 1 Execution Plan — “The Digital Kitchen” (Foundation & Roster)

**Phase 1 Goal (from `MASTER_ROADMAP.md`)**: Initialize the app, configure the “Kitchen DNA” (roles/stations), and get staff data in.

**Non‑negotiables (from `ARCHITECTURE.md`)**
- **UI layer** (`src/app/*`, `src/components/*`): render + form state + TanStack Query. **No DB calls. No model imports.**
- **Action layer** (`src/server/actions/*`): `auth()` checks + Zod validation + error handling + `await dbConnect()` + calls **Services only**. Returns `ActionResponse<T>`.
- **Service layer** (`src/server/services/*`): **only place** that imports/uses Mongoose models and performs DB queries.
- **Models** live in `src/server/models/*`. Connection singleton lives in `src/lib/db.ts`.
- **Routes** live in `src/app/*`. **No API routes** unless webhooks (not in Phase 1).

---

## Sprint 1.1 — Project Scaffold & Infrastructure

### Scope
- Next.js 15 App Router scaffold, Tailwind v4, shadcn/ui primitives, Clerk auth middleware, theme provider, TanStack Query provider, and toast plumbing.
- Establish foundational “constitution” files so all later sprints follow the same patterns.

### Files
Create:
- `src/lib/db.ts` (Mongoose singleton connection helper per constitution)
- `src/lib/utils.ts` (includes `cn()` helper)
- `src/lib/safe-action.ts` (shared Server Action wrapper for consistent `ActionResponse<T>`)
- `src/components/shared/providers.tsx` (client providers: `ThemeProvider`, `QueryClientProvider`, `Toaster`)
- `src/middleware.ts` (Clerk route protection: protect everything except `/sign-in` and `/api/webhooks(.*)`)
- `src/app/layout.tsx` (root layout wraps providers)
- `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` (Clerk sign-in)
- `src/app/(dashboard)/dashboard/layout.tsx` (dashboard shell layout)
- `src/app/(dashboard)/dashboard/page.tsx` (dashboard home placeholder)

Modify (as needed by scaffold tooling):
- `package.json`
- `next.config.*`
- `postcss.config.*`
- `src/app/globals.css` (Tailwind v4 CSS-first setup + shadcn base styles)
- `tsconfig.json` (strict mode)

### Server Actions
- **None required in this sprint** (infrastructure-only). (Optional later: add a “whoami” action if you want an explicit auth smoke test, but it is not required by Phase 1.)

### Dependencies
Install:
- **Core**: `mongoose`, `zod`
- **Auth**: `@clerk/nextjs`
- **Client data**: `@tanstack/react-query`
- **Forms**: `react-hook-form`, `@hookform/resolvers`
- **UI**: `next-themes`, `sonner`, `lucide-react`
- **shadcn/ui**: initialize shadcn + add primitives: `button`, `input`, `dropdown-menu`, `dialog`, `avatar`, `toast` (or `sonner`-based toaster per your standard)

### Validation (Success Criteria)
- **I can visit `/dashboard` and get redirected to Clerk sign-in; after signing in, I land on the dashboard shell with dark/light theme toggling working and toasts rendering via `sonner`.**

---

## Sprint 1.2 — Kitchen Configuration Schema (“The Brain”)

### Scope
- Create KitchenConfig data model + validation + services + actions.
- Build `/dashboard/settings` UI to create/update KitchenConfig using `react-hook-form` + shared Zod schema.

### Data Contract (from roadmap)
KitchenConfig fields:
- `userId` (Clerk owner ID)
- `name` (string)
- `stations` (string[])
- `roles` (string[])
- `operatingHours` (nested object: open/close times per day)

### Files
Create:
- `src/server/models/KitchenConfig.ts`
- `src/server/services/kitchen-config.service.ts`
- `src/server/actions/kitchen-config.actions.ts`
- `src/lib/validations/kitchen-config.schema.ts`
- `src/app/(dashboard)/dashboard/settings/page.tsx`
- `src/app/(dashboard)/dashboard/settings/_components/KitchenConfigForm.tsx`

Modify:
- `src/components/shared/providers.tsx` (ensure TanStack Query + toaster available to settings UI)
- `src/app/(dashboard)/dashboard/layout.tsx` (add nav link to Settings if the shell includes navigation)

### Server Actions
Add in `src/server/actions/kitchen-config.actions.ts`:
- `getKitchenConfig(): Promise<ActionResponse<KitchenConfigDTO | null>>`
  - Auth: `auth()`
  - DB: `await dbConnect()`
  - Service call: fetch config by `userId`
- `saveKitchenConfig(input: KitchenConfigInput): Promise<ActionResponse<KitchenConfigDTO>>`
  - Auth: `auth()`
  - Validation: `kitchenConfigSchema.parse(input)`
  - DB: `await dbConnect()`
  - Service call: upsert config for `userId`

### Dependencies
Install (if not already installed in 1.1):
- `zod`, `react-hook-form`, `@hookform/resolvers`

### Validation (Success Criteria)
- **Submitting `/dashboard/settings` persists a KitchenConfig document in MongoDB keyed to my Clerk `userId` (verifiable in MongoDB/Compass).**

---

## Sprint 1.3 — Staff Domain & CSV Import

### Scope
- Create Staff model + Zod schema + services + actions.
- Create `/dashboard/staff` directory view and client-side CSV parsing upload that calls a server action to validate + bulk upsert staff (match by email/phone).

### Data Contract (from roadmap)
Staff fields:
- `name`, `email`, `phone`
- `roles` (should align to KitchenConfig roles; validate server-side)
- `skills`: `{ station: string; proficiency: 1 | 2 | 3 | 4 | 5 }[]`
- `isActive` (boolean)

### Files
Create:
- `src/server/models/Staff.ts`
- `src/server/services/staff.service.ts`
- `src/server/actions/staff.actions.ts`
- `src/lib/validations/staff.schema.ts`
- `src/app/(dashboard)/dashboard/staff/page.tsx`
- `src/app/(dashboard)/dashboard/staff/_components/StaffTable.tsx`
- `src/app/(dashboard)/dashboard/staff/_components/StaffCsvImportDialog.tsx`
- `src/app/(dashboard)/dashboard/staff/_components/StaffCsvUploadButton.tsx`

Modify:
- `src/app/(dashboard)/dashboard/layout.tsx` (add nav link to Staff)
- `src/server/services/kitchen-config.service.ts` (if needed to support validation of staff roles/stations against config)

### Server Actions
Add in `src/server/actions/staff.actions.ts`:
- `listStaff(): Promise<ActionResponse<StaffDTO[]>>`
  - Auth: `auth()`
  - DB: `await dbConnect()`
  - Service call: list staff for `userId` (only active by default, or include both with an option)
- `importStaffFromCSV(input: ImportStaffInput): Promise<ActionResponse<{ inserted: number; updated: number }>>`
  - Auth: `auth()`
  - Validation: Zod parse each row (shared schema) + enforce role/station constraints using KitchenConfig
  - DB: `await dbConnect()`
  - Service call: bulk upsert by `(userId, email)` and/or `(userId, phone)`

Optional (if you want manual CRUD in Phase 1 UI; not required by roadmap but often helpful):
- `createStaff(input)`
- `updateStaff(input)`
- `setStaffActive({ staffId, isActive })`

### Dependencies
Install:
- **CSV parsing (client-side)**: `papaparse`
- **Table (optional per roadmap)**: `@tanstack/react-table`

### Validation (Success Criteria)
- **On `/dashboard/staff`, I can upload a CSV and immediately see the upserted staff rows render in the directory, and duplicates update instead of creating new records.**

---

## Sprint 1.4 — Phase 1 Hardening + End-to-End Verification Harness

### Scope
- Ensure Phase 1 data flow is verifiable programmatically and consistent with architecture.
- Add a runnable script that validates the complete Phase 1 pipeline without relying on UI clicks.

### Files
Create:
- `scripts/test-phase-1.ts` (required; see “Phase 1 Verification”)

Modify:
- `package.json` (add `test:phase-1` script to run the verification)
- `src/server/services/kitchen-config.service.ts` (ensure it exposes a deterministic “upsert by userId” method usable by actions and scripts)
- `src/server/services/staff.service.ts` (ensure it exposes:
  - single-create method
  - bulk upsert method used by `importStaffFromCSV`
  - list method to confirm persistence)
- `src/lib/db.ts` (ensure it can be safely used from a Node script context)

### Server Actions
- **No new actions required** if Sprint 1.2/1.3 already include `saveKitchenConfig`, `importStaffFromCSV`, and `listStaff`.
- If any Phase 1 UI depended on ad-hoc reads, add:
  - `getKitchenConfig` (Sprint 1.2 already specifies this)

### Dependencies
Install:
- `tsx` (dev dependency) to run TypeScript scripts easily.
- `dotenv` (optional) if you want `scripts/test-phase-1.ts` to load `.env.local`-style variables outside Next.js runtime.

### Validation (Success Criteria)
- **Running `npm run test:phase-1` prints a clear PASS/FAIL summary and exits with code 0 on success after verifying KitchenConfig + Staff + CSV upsert + Staff query.**

---

## Phase 1 Verification

### Goal
Create a script at `scripts/test-phase-1.ts` that programmatically verifies the entire Phase 1 flow end-to-end:
1. **Create Kitchen Config**
2. **Create Staff** (at least 1 record via “single create” path)
3. **Import CSV** (at least 2 rows; include one duplicate email/phone to verify upsert)
4. **Query Staff** and assert the expected records exist

### Script Requirements (Implementation Notes — no UI, no API routes)
- The script must:
  - Connect to MongoDB using `src/lib/db.ts`.
  - Call **Service-layer methods** to perform DB work (do not import Mongoose models directly into the script).
  - Use a deterministic `TEST_USER_ID` (e.g., via env var) to scope documents to a single “kitchen owner”.
  - Clean up only the test user’s records (avoid destructive global deletes).
- The script should validate:
  - KitchenConfig exists for `TEST_USER_ID` and contains at least 1 station + 1 role.
  - Creating a Staff record succeeds and is returned by `StaffService.list(...)`.
  - CSV import upserts correctly:
    - First run inserts N records.
    - Second run updates at least 1 existing record (duplicate match by email/phone).
  - Final staff list includes expected emails/phones and expected `isActive` values.

### Expected Environment Variables
- `MONGODB_URI` (or whatever your `src/lib/db.ts` expects)
- `TEST_USER_ID` (a fake but valid-looking Clerk user id string, e.g. `user_test_123`)

### Package Script
Add a `package.json` script entry (Sprint 1.4) such as:
- `test:phase-1` → runs `scripts/test-phase-1.ts` via `tsx`

### Pass Condition
- Script outputs a PASS summary including counts for:
  - KitchenConfig upserted (1)
  - Staff created (>= 1)
  - CSV imported inserted/updated counts (inserted >= 1, updated >= 1 across repeated import)
  - Staff query count (>= 2)
- Process exits with status code `0`.

