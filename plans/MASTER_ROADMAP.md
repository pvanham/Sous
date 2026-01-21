# SOUS: MASTER BUILD PLAN & ROADMAP

**Project Goal:** A reactive, intelligent scheduling platform for high-volume kitchens.

## 0. Tech Stack & Architecture (Enforced)
- **Core:** Next.js 16 (App Router), React 19, TypeScript 5.
- **Styling:** Tailwind CSS v4 (CSS-first config), `shadcn/ui` (Radix primitives), `lucide-react`.
- **Data:** MongoDB (Atlas) + Mongoose 9.
- **State:** TanStack Query v5 (Client fetching), Server Actions (Mutations).
- **Auth:** Clerk (`@clerk/nextjs`).
- **Validation:** Zod + React Hook Form.
- **Architecture:** Strict Service-Layer pattern (UI -> Action -> Service -> DB).

---

## Phase 1: The Digital Kitchen (Foundation & Roster)
**Goal:** Initialize the app, configure the "Kitchen DNA" (roles/stations), and get staff data in.

### Sprint 1.1: Project Scaffold & Infrastructure
- **Action:** Initialize Next.js 16 app, setup Tailwind 4, install Shadcn primitives (`button`, `input`, `dropdown-menu`, `toast`, `dialog`, `avatar`).
- **Database:** Create `lib/db.ts` using the Mongoose singleton pattern (prevents connection exhaustion in HMR).
- **Auth:** Configure Clerk Proxy to protect all routes except `/sign-in` and `/api/webhooks(.*)`.
- **Theme:** Setup `next-themes` provider.
> **Context for Cursor:** "Initialize a Next.js 16 project using React 19 and Tailwind 4. Configure a Mongoose connection helper in `src/lib/db.ts` that caches the connection across hot reloads. Set up Clerk authentication proxy. Install and configure `sonner` for toasts and `next-themes` for dark mode. Ensure `layout.tsx` includes the providers."

### Sprint 1.2: Kitchen Configuration Schema (The Brain)
- **Action:** Create the `KitchenConfig` model. This defines the constraints for the specific restaurant.
- **Schema Fields:**
  - `userId` (Clerk ID of owner).
  - `name` (String).
  - `stations` (Array of Strings: "Grill", "Fry", "Prep").
  - `roles` (Array of Strings: "GM", "Line Cook").
  - `operatingHours` (Nested object with open/close times per day).
- **UI:** A "Settings" form using `react-hook-form` + `zod` to create/update this config.
> **Context for Cursor:** "Create a Mongoose model `KitchenConfig` to store restaurant settings (stations, roles, operating hours). Create a Server Action `saveKitchenConfig` protected by Zod validation. Build a settings page at `/dashboard/settings` using `react-hook-form` to manage this data. Use Shadcn `Card` and `Input` components."

### Sprint 1.3: Staff Domain & CSV Import
- **Action:** Create `Staff` model.
- **Schema Fields:** `name`, `email`, `phone`, `roles` (enum from Config), `skills` (Array of objects: `{ station: string, proficiency: 1-5 }`), `isActive`.
- **Feature:** A "Staff Directory" table using `@tanstack/react-table` (if installed) or standard mapping.
- **Import Logic:** Server Action that accepts parsed CSV JSON, validates against Staff Zod schema, and performs bulk upsert (match by email/phone).
> **Context for Cursor:** "Create a `Staff` Mongoose model. Implement a Server Action `importStaffFromCSV` that takes an array of staff objects, validates them using Zod, and upserts them into MongoDB. Create a UI at `/dashboard/staff` to list staff and a button to upload a CSV. (Assume CSV parsing happens client-side for now)."

---

## Phase 2: The Scheduler Grid (Visuals & Data)
**Goal:** A reactive grid to view and manage shifts.

### Sprint 2.1: Schedule & Shift Data Models
- **Action:** Create `Schedule` (Week container) and `Shift` models.
- **Schema Strategy:**
  - `Schedule`: `{ weekStartDate: Date, locationId: ObjectId, status: 'DRAFT'|'PUBLISHED' }`
  - `Shift`: `{ scheduleId, staffId, start: Date, end: Date, station: String, notes: String }`
- **Indexes:** Compound index on Shift for `{ scheduleId: 1, staffId: 1 }` to quickly find overlaps.
> **Context for Cursor:** "Create Mongoose models for `Schedule` and `Shift`. `Schedule` represents a week. `Shift` contains start/end times and links to a Staff member. Add Zod schemas for both. Ensure `Shift` start time is always before end time."

### Sprint 2.2: The Visual Grid (CSS Grid)
- **Action:** Build the `ScheduleGrid` component using CSS Grid.
- **Structure:** X-Axis = Days (Mon-Sun), Y-Axis = Staff Members.
- **State:** Use `useQuery` to fetch shifts for the selected week.
> **Context for Cursor:** "Create a `ScheduleGrid` component. It should accept a `startDate` and a list of `staff`. Use CSS Grid to render a row for each staff member and columns for days. Fetch shift data using TanStack Query. Render `ShiftCard` components inside the correct grid cells based on their date/staffId."

### Sprint 2.3: Shift Management (CRUD)
- **Action:** Click-to-create and Click-to-edit via Shadcn Dialog/Popover.
- **Inputs:** Start Time, End Time, Station (Select from `KitchenConfig`), Notes.
- **Validation:** Prevent overlapping shifts for the same user on the server side.
> **Context for Cursor:** "Implement a `ShiftForm` component using `react-hook-form`. When clicking an empty grid cell, open a Dialog with this form pre-filled with the clicked date/staff. Create Server Actions `createShift`, `updateShift`, and `deleteShift`. Implement optimistic updates in React Query so the UI feels instant."

---

## Phase 3: The Reactive Hotline (SMS & AI)
**Goal:** Handle real-world chaos via SMS.

### Sprint 3.1: Twilio Webhook Handling
- **Action:** Set up the API route to receive SMS.
- **Logic:** Receive POST, lookup Staff by Phone, save raw message to `MessageLog` collection.
> **Context for Cursor:** "Create an API route `/api/webhooks/twilio`. It should validate the request, find the Staff member associated with the sender's phone number, and save the message text to a new `MessageLog` Mongoose model. Return a 200 OK."

### Sprint 3.2: AI Intent Parsing (The "Brain")
- **Action:** Service to analyze the text using OpenAI.
- **Prompt:** "Analyze this SMS. JSON Output: `{ type: 'CALL_OUT' | 'LATE' | 'OTHER', date: ISOString, reason: string, sentiment: string }`."
- **Integration:** Trigger parsing immediately after webhook saves the log.
> **Context for Cursor:** "Create a lib function `analyzeIncomingMessage(text: string)`. Use OpenAI to parse the intent, date, and reason from the text. Return a typed object. Update the `MessageLog` entry with this structured data after parsing."

### Sprint 3.3: The "Inbox" Dashboard
- **Action:** Dedicated Manager view for processing requests.
- **UI:** Split-pane view (List left, Details right).
- **Smart Feature:** "Coverage Suggestions" (Query DB for staff with same skill + open slot).
> **Context for Cursor:** "Build a `/dashboard/inbox` page. Fetch unread `MessageLog` entries. Display them in a list. When clicked, show details. If the intent is 'CALL_OUT', run a query to find available staff with matching skills and display them as 'Recommended Replacements' buttons."

---

## Phase 4: Labor Logic & Constraints
**Goal:** Define "what success looks like" (Staffing Targets).

### Sprint 4.1: Labor Targets (Templates)
- **Action:** Create `LaborTarget` model and Template Builder UI.
- **Data:** Required headcount per station per hour block (e.g., "Fri 5pm-9pm: 2 Grill").
> **Context for Cursor:** "Create a `LaborTemplate` model that stores staffing requirements (station, count, start time, end time). Build a UI to create and save these templates. Allow applying a template to a specific date in the schedule."

### Sprint 4.2: Coverage Validation Logic
- **Action:** Real-time visual checking (Red/Green bar under Grid).
- **Logic:** `ActiveShifts` vs `LaborTarget`.
> **Context for Cursor:** "Create a `CoverageStatus` component. It takes the current week's shifts and the applied Labor Targets. Calculate coverage percentage per 30-minute block. Visualize understaffed periods with a red indicator at the bottom of the schedule grid."

---

## Phase 5: The "Sous" Agent (Auto-Scheduler)
**Goal:** One-click schedule generation.

### Sprint 5.1: The Auto-Fill Algorithm
- **Action:** Deterministic "Greedy" algorithm Server Action.
- **Logic:** Get empty slots -> Sort by priority -> Find best staff (Skill > Availability > Overtime).
> **Context for Cursor:** "Implement a `generateDraftSchedule` Server Action. It should iterate through the `LaborTargets` for the week. For each required slot, find the best available staff member (matching skill, not in OT). Save these new shifts with `status: 'DRAFT'`."

### Sprint 5.2: Publish & Notify
- **Action:** Finalize week, change status to `PUBLISHED`, trigger notifications.
> **Context for Cursor:** "Create a `publishSchedule` Server Action. It validates that no critical constraints are broken (e.g., no manager on duty). It updates the Schedule status to 'PUBLISHED' and triggers a mock notification function for each staff member with a shift."

---

## Phase 6: Production Polish
**Goal:** Security, Mobile, and Stability.

### Sprint 6.1: Role-Based Access (RBAC)
- **Action:** Lock down API using Clerk Metadata (`admin`, `manager`, `staff`).
> **Context for Cursor:** "Update Clerk proxy and Server Actions to enforce RBAC. Managers can edit everything. Staff can only read their own shifts. Store the user's role in Clerk public metadata."

### Sprint 6.2: Mobile "My Shifts" View
- **Action:** Simplified vertical card list for staff on mobile.