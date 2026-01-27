# SOUS: MASTER BUILD PLAN & ROADMAP

**Project Goal:** A reactive, AI-powered scheduling platform for high-volume kitchens.

**Differentiator:** LLM-powered automation throughout—from intelligent schedule generation to autonomous employee request handling.

---

## Tech Stack & Architecture (Enforced)

| Category       | Technology                                                   |
| -------------- | ------------------------------------------------------------ |
| **Core**       | Next.js 16 (App Router), React 19, TypeScript 5              |
| **Styling**    | Tailwind CSS v4 (CSS-first), shadcn/ui (Radix), lucide-react |
| **Database**   | MongoDB Atlas + Mongoose 9                                   |
| **State**      | TanStack Query v5 (client), Server Actions (mutations)       |
| **Auth**       | Clerk (`@clerk/nextjs`)                                      |
| **Validation** | Zod + React Hook Form                                        |
| **AI/LLM**     | OpenAI API (GPT-4o), Vercel AI SDK                           |
| **SMS**        | Twilio (Phase 4)                                             |

**Architecture:** Strict 3-Layer pattern (UI → Action → Service → DB). See `ARCHITECTURE.md`.

---

## Phase 1: The Digital Kitchen (Foundation & Roster) ✅ COMPLETE

**Status**: ✅ Complete (January 2026)  
**Documentation**: See `plans/PHASE-1-COMPLETE.md`

**Delivered:**

- Project scaffold with Next.js 16, Tailwind 4, shadcn/ui
- Clerk authentication with middleware protection
- Kitchen configuration (stations, roles, operating hours)
- Staff management with CSV import
- Mongoose singleton connection pattern

---

## Phase 2: The Scheduler Grid (Visuals & Data) ✅ COMPLETE

**Status**: ✅ Complete (January 2026)  
**Documentation**: See `plans/PHASE-2-COMPLETE.md`

**Delivered:**

- Schedule & Shift data models with overlap detection
- 3 view modes (Staff View, Time View, Day/Station View)
- Complete CRUD with optimistic updates
- Manager coverage warnings
- Publish workflow (DRAFT → PUBLISHED)

---

## Phase 2.5: Multi-Location Foundation (Infrastructure Refactor) ✅ COMPLETE

**Status**: ✅ Complete (January 2026)

**Purpose:** Future-proof the architecture for multi-location support. All data is now scoped by `orgId` + `locationId` instead of `userId`.

**Delivered:**

- **New Models:** `Organization`, `Location`, `OrganizationMember`
- **Multi-Tenancy Scoping:** All existing models (`KitchenConfig`, `Staff`, `Schedule`, `Shift`) now use `orgId` + `locationId`
- **Location Context Utility:** `getLocationContext(userId)` auto-creates org/location for new users (MVP bootstrap)
- **Updated Services:** All service methods use `(orgId, locationId)` parameters
- **Migration Script:** `scripts/migrate-to-multi-location.ts` for existing data

**MVP Behavior:**
- First-time users get auto-created organization + location
- Single-location UX remains unchanged
- Foundation ready for multi-location switcher in Phase 5+

**Key Files:**
```
src/lib/auth/get-location-context.ts     # Resolve org/location from Clerk userId
src/server/models/Organization.ts        # Tenant container
src/server/models/Location.ts            # Kitchen location
src/server/models/OrganizationMember.ts  # User-to-location membership
scripts/migrate-to-multi-location.ts     # Data migration script
```

---

## Phase 3: The "Sous" Agent (AI Schedule Generation)

**Goal:** One-click intelligent schedule generation using a **Hybrid Validator-Selector Pattern**.

**Key Architecture Decision:** Pure LLMs struggle with hard constraint satisfaction (max hours, availability, overlapping shifts). Pure algorithms feel "robotic" and ignore human elements. **Sous uses a hybrid approach** where:

- **Algorithms** define the "Search Space" (filter valid candidates)
- **LLM** makes the "Selection" (choose best from valid options + explain reasoning)
- **Algorithms** validate the output (catch any AI mistakes)

**USP:** "Other schedulers are just calculators. Sous is an intelligent assistant that checks the laws (Algorithm) but cares about your people (LLM), and explains every decision it makes."

---

### The Hybrid Architecture (Phase 3 Foundation)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 1: HARD FILTER (Algorithm)                           │
│                                                                              │
│   Input: All 50 Staff Members + Time Slot                                    │
│   Logic:                                                                     │
│     - Remove staff marked "Unavailable" for that time                        │
│     - Remove staff already scheduled (overlap check)                         │
│     - Remove staff without required Skill (station matching)                 │
│     - Flag staff approaching max hours (overtime warning)                    │
│   Output: Candidate List per slot                                            │
│     Shift A (Grill): [John, Sarah, Mike]                                     │
│     Shift B (Prep): [Alice, Bob]                                             │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 2: SOFT SELECTOR (LLM)                               │
│                                                                              │
│   Input: ONLY the valid candidates (not full staff list!)                    │
│   Prompt: "Select the best person from these VALID options to maximize       │
│            team balance. John prefers mornings. Sarah needs more hours."     │
│   Output: JSON with assignments + reasoning                                  │
│                                                                              │
│   Why this works: AI physically CANNOT choose invalid staff                  │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    STEP 3: VALIDATOR (Algorithm)                                 │
│                                                                                  │
│   Checks:                                                                        │
│     - Did AI double-book anyone?                                                 │
│     - Did AI exceed max hours?                                                   │
│     - Any constraint violations?                                                 │
│   Action:                                                                        │
│     - Valid → Save to database                                                   │
│     - Invalid → Auto-retry with error context (Self-Correction Loop, max 3x)    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

### Sprint 3.1: Labor Requirements Model

**Scope:** Data layer for staffing requirements that the AI will fulfill.

**Files to Create:**

- `src/server/models/LaborRequirement.ts`
- `src/server/services/labor-requirement.service.ts`
- `src/server/actions/labor-requirement.actions.ts`
- `src/lib/validations/labor-requirement.schema.ts`
- `src/types/labor-requirement.ts`

**Schema Design:**

```typescript
LaborRequirement {
  userId: string,
  dayOfWeek: 0-6,           // 0=Sunday, 1=Monday, etc.
  station: string,          // Must match KitchenConfig.stations
  startTime: string,        // "09:00"
  endTime: string,          // "17:00"
  minStaff: number,         // Minimum required
  preferredStaff: number,   // Ideal count
  priority: 'critical' | 'high' | 'normal' | 'low'
}
```

**Service Methods:**

- `getByUserId(userId)` - All requirements for a kitchen
- `getByDayOfWeek(userId, day)` - Requirements for a specific day
- `upsert(userId, data)` - Create or update requirement
- `deleteById(userId, id)` - Remove requirement

> **Context for Cursor:** "Create a `LaborRequirement` Mongoose model to store staffing requirements per station per time block. Follow the 3-layer architecture: Model → Service → Actions. Create Zod schemas for validation. The service should handle CRUD operations and return DTOs. Actions must check auth() and call the service layer."

---

### Sprint 3.2: Labor Requirements UI

**Scope:** Template builder interface for defining staffing needs.

**Files to Create:**

- `src/app/(dashboard)/dashboard/labor/page.tsx`
- `src/app/(dashboard)/dashboard/labor/_components/LaborGrid.tsx`
- `src/app/(dashboard)/dashboard/labor/_components/RequirementCell.tsx`
- `src/app/(dashboard)/dashboard/labor/_components/RequirementFormDialog.tsx`

**UI Design:**

```
┌────────────────────────────────────────────────────────┐
│ Labor Requirements                                      │
├─────────┬────────┬────────┬────────┬────────┬─────────┤
│ Station │ Mon    │ Tue    │ Wed    │ Thu    │ Fri ... │
├─────────┼────────┼────────┼────────┼────────┼─────────┤
│ Grill   │ 2 (9-5)│ 2 (9-5)│ 3 (9-9)│ 3 (9-9)│ 4 (9-11)│
│ Prep    │ 1 (6-2)│ 1 (6-2)│ 2 (6-3)│ 2 (6-3)│ 2 (6-3) │
└─────────┴────────┴────────┴────────┴────────┴─────────┘
```

**Interactions:**

- Click cell → Open dialog to set min/preferred staff, time range, priority
- Visual indicators for priority levels (color-coded borders)
- Summary row showing total labor hours per day

> **Context for Cursor:** "Build a `/dashboard/labor` page with a grid showing labor requirements by station and day. Use CSS Grid layout. Click any cell to open a dialog for editing requirements. Use TanStack Query to fetch and mutate data via the server actions from Sprint 3.1. Add navigation link in dashboard layout."

---

### Sprint 3.3: Staff Availability & Constraints Model

**Scope:** Data layer for staff preferences and hard constraints the AI must respect.

**Files to Create:**

- `src/server/models/StaffAvailability.ts`
- `src/server/services/staff-availability.service.ts`
- `src/server/actions/staff-availability.actions.ts`
- `src/lib/validations/staff-availability.schema.ts`
- `src/types/staff-availability.ts`

**Schema Design:**

```typescript
StaffAvailability {
  userId: string,           // Kitchen owner
  staffId: ObjectId,        // Staff member
  dayOfWeek: 0-6,
  availableFrom: string,    // "09:00" or null (not available)
  availableTo: string,      // "22:00" or null
  preference: 'preferred' | 'available' | 'unavailable',
  notes: string             // "Has class until 2pm on Mondays"
}

// Also update Staff model to add:
Staff {
  ...existing,
  maxHoursPerWeek: number,     // Default 40
  minHoursPerWeek: number,     // Default 0
  preferredStations: string[], // Ordered by preference
  certifications: string[],    // e.g., "Food Handler", "Manager Cert"
  hourlyRate: number,          // Required for labor cost calculations
}
```

**Service Methods:**

- `getByStaffId(staffId)` - All availability for a staff member
- `getAvailableStaff(userId, dayOfWeek, startTime, endTime)` - Find who can work a slot
- `bulkUpsert(userId, staffId, availabilities[])` - Set weekly availability

> **Context for Cursor:** "Create a `StaffAvailability` model for storing when staff can/prefer to work. Add fields to the existing Staff model for constraints (maxHoursPerWeek, minHoursPerWeek, preferredStations, certifications). Also add hourlyRate for labor cost tracking. Create service methods that can query available staff for a given time slot. Follow the 3-layer architecture."

---

### Sprint 3.4: Staff Availability UI

**Scope:** Interface for staff/managers to set availability preferences.

**Files to Create:**

- `src/app/(dashboard)/dashboard/staff/[id]/availability/page.tsx`
- `src/app/(dashboard)/dashboard/staff/[id]/availability/_components/AvailabilityGrid.tsx`
- `src/app/(dashboard)/dashboard/staff/[id]/availability/_components/AvailabilitySlot.tsx`
- Update `src/app/(dashboard)/dashboard/staff/_components/StaffTable.tsx` - Add availability link

**UI Design:**

```
┌────────────────────────────────────────────────────────┐
│ John Smith - Weekly Availability                        │
├─────────┬────────┬────────┬────────┬────────┬─────────┤
│ Time    │ Mon    │ Tue    │ Wed    │ Thu    │ Fri ... │
├─────────┼────────┼────────┼────────┼────────┼─────────┤
│ Morning │ ✓ Pref │ ✓ Avail│ ✗      │ ✓ Avail│ ✓ Pref  │
│ Afternoon│ ✓ Pref│ ✓ Avail│ ✗      │ ✗      │ ✓ Pref  │
│ Evening │ ✗      │ ✗      │ ✗      │ ✓ Avail│ ✓ Avail │
└─────────┴────────┴────────┴────────┴────────┴─────────┘
│ Max Hours/Week: [40]  Min Hours/Week: [20]              │
│ Preferred Stations: [Grill] [Prep]                      │
└────────────────────────────────────────────────────────┘
```

**Interactions:**

- Click slot to cycle: Preferred → Available → Unavailable
- Drag to select multiple slots
- Save button persists changes

> **Context for Cursor:** "Create an availability management page at `/dashboard/staff/[id]/availability`. Display a weekly grid where managers can set each staff member's availability. Use click-to-toggle for preference states. Include fields for max/min hours per week and preferred stations. Add a link to this page from the staff table."

---

### Sprint 3.4a: Time-Off Requests Model

**Scope:** Data layer for specific date-range time-off requests (vacation, appointments). This is different from weekly availability patterns—it's for specific dates when staff are unavailable.

**Files to Create:**

- `src/server/models/TimeOffRequest.ts`
- `src/server/services/time-off-request.service.ts`
- `src/server/actions/time-off-request.actions.ts`
- `src/lib/validations/time-off-request.schema.ts`
- `src/types/time-off-request.ts`

**Schema Design:**

```typescript
TimeOffRequest {
  userId: string,           // Kitchen owner
  staffId: ObjectId,        // Staff member requesting time off
  startDate: Date,          // First day off
  endDate: Date,            // Last day off (inclusive)
  reason?: string,          // "Vacation", "Doctor appointment", etc.
  status: 'pending' | 'approved' | 'denied',
  createdAt: Date,
  reviewedAt?: Date,        // When approved/denied
  reviewedBy?: string,      // userId of approver
}
```

**Service Methods:**

- `create(userId, staffId, data)` - Submit time-off request
- `getByStaffId(userId, staffId)` - Get all requests for a staff member
- `getByDateRange(userId, startDate, endDate)` - Get all requests in a date range
- `updateStatus(userId, requestId, status, reviewedBy)` - Approve/deny request
- `getApprovedTimeOff(userId, staffId, startDate, endDate)` - Get approved time off for a staff member in a date range

**Important:** The `CandidateService` (Sprint 3.5) must check approved `TimeOffRequests` when filtering candidates for a shift. A staff member with approved time off for a date should not be included in the candidate list for shifts on that date.

> **Context for Cursor:** "Create a `TimeOffRequest` model for specific date-range time-off requests (different from weekly availability patterns). This handles vacation days, appointments, etc. Include approval workflow with 'pending', 'approved', 'denied' statuses. The service should have a method to check if a staff member has approved time off for a given date range. This will be used by CandidateService to exclude staff from shift assignments. Follow 3-layer architecture."

---

### Sprint 3.4b: Time-Off Requests UI & Approval

**Scope:** Minimal manager-facing workflow to review and approve/deny time-off requests. This connects Sprint 3.4a's model/service/actions to actual day-to-day usage so CandidateService filtering is effective in practice.

**Files to Create/Update (UI Layer):**

- `src/app/(dashboard)/dashboard/time-off/page.tsx`
- `src/app/(dashboard)/dashboard/time-off/_components/TimeOffRequestTable.tsx`
- `src/app/(dashboard)/dashboard/time-off/_components/TimeOffRequestReviewDialog.tsx`
- `src/app/(dashboard)/dashboard/time-off/_components/CreateTimeOffRequestDialog.tsx`
- Update `src/app/(dashboard)/dashboard/staff/_components/StaffTable.tsx` - Add "Time Off" link
- Update dashboard navigation (layout) to include "Time Off"

**UI Requirements:**

- Table view with filters: Pending / Approved / Denied
- Review dialog: Approve / Deny, optional manager note
- Create request dialog (manager entry): Select staff + date range + optional reason
- Audit visibility: show reviewedAt + reviewedBy on approved/denied requests

**Notes:**

- This UI should call the Server Actions from Sprint 3.4a (no direct DB access).
- Approved requests must immediately impact candidate filtering in Sprint 3.5.

> **Context for Cursor:** "Build a manager-facing time-off approval UI at `/dashboard/time-off`. Use TanStack Query to list TimeOffRequests via server actions. Provide filters (pending/approved/denied) and a review dialog to approve/deny requests. Also provide a dialog for managers to create a request for a staff member. Show reviewedAt/reviewedBy fields. Add a 'Time Off' link in the dashboard navigation and from the staff table. Follow 3-layer architecture (UI → Actions → Services)."

---

### Sprint 3.5: Candidate Filter Service (Hard Filter Layer)

**Scope:** Pure TypeScript service that filters valid staff candidates BEFORE AI sees them. This is the foundation of the hybrid approach.

**Files to Create:**

- `src/server/services/candidate.service.ts`
- `src/types/candidate.ts`

**Service Design:**

```typescript
// candidate.service.ts - Pure TypeScript, no LLM calls
export const CandidateService = {
  /**
   * Get valid candidates for a specific time slot
   * This is the "Hard Filter" - removes anyone who CAN'T work
   */
  async getCandidatesForSlot(
    userId: string,
    date: Date,
    startTime: string,
    endTime: string,
    station: string,
    existingShifts: ShiftDTO[]
  ): Promise<CandidateDTO[]>,

  /**
   * Get candidates for all open slots in a day
   * Used for day-by-day generation (chunking strategy)
   */
  async getCandidatesForDay(
    userId: string,
    date: Date,
    laborRequirements: LaborRequirementDTO[],
    existingShifts: ShiftDTO[]
  ): Promise<SlotCandidates[]>,

  /**
   * Check if assigning a shift would cause overtime
   */
  async wouldCauseOvertime(
    staffId: string,
    proposedShift: { date: Date, startTime: string, endTime: string },
    existingShifts: ShiftDTO[],
    maxHours: number
  ): Promise<boolean>,
};

// Filter logic (pure functions)
function filterByAvailability(staff, availability, dayOfWeek, startTime, endTime): StaffDTO[];
function filterBySkills(staff, requiredStation): StaffDTO[];
function filterByExistingShifts(staff, existingShifts, proposedStart, proposedEnd): StaffDTO[];
function flagOvertimeRisk(staff, existingShifts): StaffWithOvertimeFlag[];
```

**Candidate Output Structure:**

```typescript
interface CandidateDTO {
  staffId: string;
  staffName: string;
  skills: { station: string; proficiency: number }[];
  preference: "preferred" | "available"; // From availability
  currentWeekHours: number;
  maxHoursPerWeek: number;
  overtimeWarning: boolean; // Would this shift push them into overtime?
  preferredStations: string[];
  notes?: string;
}

interface SlotCandidates {
  slot: {
    station: string;
    startTime: string;
    endTime: string;
    minStaff: number;
    preferredStaff: number;
    priority: "critical" | "high" | "normal" | "low";
  };
  candidates: CandidateDTO[]; // Only VALID candidates
  hasSufficientCandidates: boolean;
}
```

> **Context for Cursor:** "Create a CandidateService that implements the 'Hard Filter' step of the hybrid AI scheduling approach. This service filters staff to ONLY those who are VALID for a given slot (available, have skill, not already scheduled, not exceeding max hours). It should use the StaffAvailability and Staff models. IMPORTANT: Must also check approved TimeOffRequests (from Sprint 3.4a) and exclude staff who have approved time off for the shift date. Time handling: CandidateService receives slot inputs as (date + startTime/endTime). Convert these to Date ranges using KitchenConfig.timezone (IANA) so day-of-week and overlap checks are timezone-correct (DST-safe). Return CandidateDTO objects with relevant context for the AI. Include an overtime warning flag. This service is PURE TypeScript - no OpenAI calls. Follow 3-layer architecture."

---

### Sprint 3.6: OpenAI Client & AI Cost Tracking

**Scope:** OpenAI integration with cost tracking to prevent runaway usage.

**Files to Create:**

- `src/lib/ai/openai-client.ts`
- `src/server/models/AIUsageLog.ts`
- `src/server/services/ai-usage.service.ts`
- Update `src/server/models/KitchenConfig.ts` - Add timezone + AI usage limits

**Dependencies to Install:**

```bash
npm install openai ai
```

**KitchenConfig Updates:**

```typescript
KitchenConfig {
  ...existing,
  timezone: string,  // IANA timezone, e.g., "America/New_York"
  aiSettings: {
    monthlyGenerationLimit: number,  // Default 50 generations/month
    subscriptionTier: 'free' | 'pro' | 'enterprise',  // Future use
  }
}
```

**Time & Timezone Conventions (Critical):**

- Shifts are stored in the database as `start: Date` and `end: Date` (absolute timestamps).
- Labor requirements and availability use `date + startTime/endTime` inputs for UI ergonomics.
- All conversions from `date + time` → `Date` must use `KitchenConfig.timezone` (restaurant-local timezone).
- DST-safe rule: avoid ambiguous local times by using timezone-aware conversion utilities. Never assume server timezone.

**AI Usage Tracking:**

```typescript
AIUsageLog {
  userId: string,
  action: 'schedule_generation' | 'schedule_refinement' | 'message_parsing',
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  estimatedCost: number,  // In cents
  createdAt: Date,
}

// Service methods
AIUsageService = {
  async logUsage(userId, action, usage): Promise<void>,
  async getMonthlyUsage(userId): Promise<UsageSummary>,
  async canGenerate(userId): Promise<{ allowed: boolean; remaining: number }>,
};
```

**OpenAI Client:**

```typescript
// openai-client.ts
export async function generateJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  options?: { userId?: string; action?: string },
): Promise<{ data: T; usage: TokenUsage }>;

export async function generateCompletion(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number },
): Promise<{ content: string; usage: TokenUsage }>;
```

**Fallback Behavior:**

If OpenAI is unavailable (rate limited, service down, or user exceeds monthly limit), provide a basic algorithmic fallback:

- Assign first available candidate to each slot (no AI reasoning)
- Use simple rules: match skill requirements, respect availability, avoid overlaps
- Mark the schedule as "Generated without AI optimization"
- Log the fallback event for monitoring
- Display clear message to user: "Schedule created using basic assignment (AI unavailable)"

This ensures the app remains functional even when AI services are down.

> **Context for Cursor:** "Create an OpenAI client wrapper in `src/lib/ai/openai-client.ts`. It should: (1) handle API calls with proper error handling and retries, (2) track token usage, (3) support JSON mode for structured output. Also create an AIUsageLog model and AIUsageService to track usage per user. Update KitchenConfig: add `timezone` (IANA string) and `aiSettings.monthlyGenerationLimit`. The client should check usage limits before making calls and throw a clear error if limit exceeded. Implement fallback behavior: if OpenAI is unavailable or limit exceeded, use basic algorithmic assignment (first available candidate per slot) and mark schedule as 'Generated without AI optimization'. Ensure all scheduling time conversions use KitchenConfig.timezone (DST-safe)."

---

### Sprint 3.7: AI Scheduling Agent Service (Selector Layer)

**Scope:** The LLM "Soft Selector" that picks from valid candidates.

**Files to Create:**

- `src/server/services/ai/scheduling-agent.service.ts`
- `src/server/services/ai/prompts/schedule-generation.ts`
- `src/types/ai-scheduling.ts`

**Key Difference from Pure LLM Approach:** The AI now receives ONLY pre-filtered candidates, not the full staff list. This dramatically reduces hallucination risk.

**Service Design:**

```typescript
// scheduling-agent.service.ts
export const SchedulingAgentService = {
  /**
   * Build context with pre-filtered candidates per slot
   */
  async buildSchedulingContext(userId: string, weekStart: Date): Promise<SchedulingContext>,

  /**
   * Generate schedule for ONE day (chunking strategy for large kitchens)
   * Receives candidates per slot, not raw staff list
   */
  async generateDaySchedule(
    context: DaySchedulingContext,
    previousDayClosingShifts?: ShiftDTO[]  // Avoid clopening violations
  ): Promise<GeneratedDaySchedule>,

  /**
   * Generate full week schedule (calls generateDaySchedule for each day)
   */
  async generateWeekSchedule(context: SchedulingContext): Promise<GeneratedSchedule>,
};

// The AI receives this FILTERED context
interface DaySchedulingContext {
  date: Date;
  dayOfWeek: string;
  slots: SlotCandidates[];  // Pre-filtered candidates per slot!
  existingShifts: ShiftDTO[];
  previousDayClosingShifts?: ShiftDTO[];  // To check for clopening
  kitchenContext: {
    operatingHours: { open: string; close: string };
    totalStaffCount: number;
  };
}
```

**Prompt Strategy (Key Change):**

```
You are Sous, a kitchen scheduling assistant.

You will receive a list of OPEN SLOTS and VALID CANDIDATES for each slot.
All candidates have already been verified as available and qualified.
Your job is to SELECT the best candidate from each slot's options.

Consider:
- Staff preferences (preferred stations, preferred times)
- Fair hour distribution
- Team balance and experience mix
- Clopening avoidance (don't schedule someone who closed last night for early morning)

For each assignment, explain your reasoning in 1-2 sentences.

OUTPUT FORMAT: JSON array of shift assignments
```

> **Context for Cursor:** "Create the SchedulingAgentService that implements the 'Soft Selector' step. It receives SlotCandidates (pre-filtered by CandidateService) and asks the AI to SELECT the best option from valid candidates only. Implement day-by-day generation (chunking strategy) where each day is generated separately, passing the previous day's closing shifts to avoid clopening violations. The prompt should emphasize that all candidates are already verified as valid."

---

### Sprint 3.8: Schedule Validator Service (Validator Layer)

**Scope:** Deterministic validation of AI output with self-correction loop.

**Files to Create:**

- `src/server/services/schedule-validator.service.ts`
- `src/lib/validations/generated-schedule.schema.ts`

**Service Design:**

```typescript
// schedule-validator.service.ts
export const ScheduleValidatorService = {
  /**
   * Validate AI-generated schedule against all hard constraints
   */
  async validate(
    generated: GeneratedSchedule,
    context: SchedulingContext
  ): Promise<ValidationResult>,

  /**
   * Self-correction: feed errors back to AI for retry
   */
  async retryWithCorrections(
    original: GeneratedSchedule,
    errors: ValidationError[],
    context: SchedulingContext,
    attempt: number
  ): Promise<GeneratedSchedule>,
};

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  type: 'double_booking' | 'unavailable_staff' | 'max_hours_exceeded' |
        'skill_mismatch' | 'invalid_staff_id' | 'overlap';
  staffId: string;
  staffName: string;
  shiftIndex: number;
  message: string;
  correctionHint: string;  // "John is already scheduled 2pm-6pm, choose different time"
}
```

**Self-Correction Flow:**

```typescript
async function generateWithRetry(context, maxRetries = 3) {
  let schedule = await SchedulingAgentService.generateWeekSchedule(context);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const validation = await ScheduleValidatorService.validate(
      schedule,
      context,
    );

    if (validation.valid) return schedule;

    if (attempt === maxRetries) {
      throw new Error(`Failed after ${maxRetries} attempts`);
    }

    // Feed errors back to AI
    schedule = await ScheduleValidatorService.retryWithCorrections(
      schedule,
      validation.errors,
      context,
      attempt,
    );
  }
}
```

> **Context for Cursor:** "Create a ScheduleValidatorService that validates AI-generated schedules against hard constraints. Check for: double-bookings, unavailable staff assignments, max hours violations, skill mismatches. If validation fails, implement a self-correction loop that feeds the specific errors back to the AI with correction hints. Allow up to 3 retry attempts before failing. Return both errors (hard failures) and warnings (soft issues like overtime risk)."

---

### Sprint 3.9: Schedule Generation Action & UI

**Scope:** Wire up the hybrid generation pipeline to the schedule page.

**Files to Create/Update:**

- `src/server/actions/schedule-generation.actions.ts`
- Update `src/app/(dashboard)/dashboard/schedule/_components/ScheduleActions.tsx`
- `src/app/(dashboard)/dashboard/schedule/_components/GenerateScheduleDialog.tsx`
- `src/app/(dashboard)/dashboard/schedule/_components/GeneratedShiftPreview.tsx`

**Generation Action Flow:**

```typescript
// schedule-generation.actions.ts
export async function generateSchedule(scheduleId: string) {
  // 1. Check AI usage limits
  const canGenerate = await AIUsageService.canGenerate(userId);
  if (!canGenerate.allowed) {
    return { success: false, error: `Monthly limit reached.` };
  }

  // 2. Build context (includes candidate filtering via CandidateService)
  const context = await SchedulingAgentService.buildSchedulingContext(
    userId,
    weekStart,
  );

  // 3. Generate with validation + retry loop
  const schedule = await generateWithRetry(context);

  // 4. Log AI usage
  await AIUsageService.logUsage(userId, "schedule_generation", schedule.usage);

  // 5. Return for preview (don't save yet)
  return {
    success: true,
    data: { shifts: schedule.shifts, warnings: schedule.warnings },
  };
}
```

**UI Flow:**

1. User clicks "Generate Schedule" button
2. Check usage limit → Show remaining generations
3. Dialog opens showing labor requirements summary
4. User confirms → Show progress (day by day generation)
5. Preview shows generated shifts with AI reasoning
6. Show any warnings (overtime risks, unfilled slots)
7. User can accept all, modify, or regenerate
8. Accept → Shifts saved to database

**Data Readiness Gate (Pre-Generation Checklist):**

Before generation begins, the dialog should run readiness checks and surface issues clearly. If critical data is missing, either block generation or require explicit confirmation.

**Readiness Checks:**

- Missing `hourlyRate` for any active staff (required for labor cost tracking)
- Missing/empty StaffAvailability for active staff (or low completion %)
- Requirements missing for open days/stations
- Requirements outside operating hours
- Skill coverage gaps: requirements with no qualified candidates

**UI Copy Guidance:**

- "X staff missing hourly rate"
- "Availability completeness: X%"
- "Y requirements have no qualified candidates"

This prevents “AI failed” experiences caused by incomplete configuration and improves trust.

**Graceful Failure Handling:**

If generation fails after all retries, **never** show just an error message. Instead:

1. **Show Partial Results**: "We filled X of Y required shifts. These slots couldn't be filled due to availability conflicts:"
   - List unfilled slots with reasons (e.g., "Friday 5pm-10pm Grill: No available qualified staff")
2. **Offer Recovery Options**:
   - "View Partial Schedule" → Show what was successfully generated
   - "Adjust Labor Requirements" → Link to labor requirements page
   - "Review Staff Availability" → Link to availability management
   - "Try Again" → Retry generation button

3. **Provide Context**: Explain why it failed:
   - "3 shifts couldn't be filled because no staff are available during those times"
   - "2 shifts need Grill skills but all qualified staff are already scheduled"
   - "Consider adjusting required staffing levels or staff availability"

4. **Save Progress**: If 80%+ of shifts were generated, offer to save the partial schedule as a draft

Never leave users with a dead-end error. Always provide actionable next steps.

> **Context for Cursor:** "Create the schedule generation action and UI. The action should: (1) check AI usage limits first, (2) use the hybrid pipeline (CandidateService → SchedulingAgentService → ScheduleValidatorService), (3) log usage, (4) return shifts for preview without saving. Create GenerateScheduleDialog that shows progress, displays generated shifts with reasoning, and shows warnings. IMPORTANT: Add a Data Readiness Gate checklist before generation (missing hourlyRate, low availability completeness, missing requirements, requirements outside operating hours, no qualified candidates). If critical items are missing, block generation or require explicit confirmation, with clear UI copy (e.g., 'X staff missing hourly rate'). Also implement graceful failure handling—if generation fails, show partial results with specific unfilled slots and reasons, offer recovery options (view partial, adjust requirements, review availability, try again), and if 80%+ succeeded, offer to save as draft. Never show just an error message. Add 'Generate Schedule' button to ScheduleActions."

---

### Sprint 3.10: Schedule Refinement with Snapshotting

**Scope:** Allow iterative refinement with undo capability.

**Files to Create/Update:**

- `src/server/services/ai/schedule-refiner.service.ts`
- `src/server/models/ScheduleSnapshot.ts`
- `src/server/services/schedule-snapshot.service.ts`
- `src/server/actions/schedule-generation.actions.ts` - Add refine action
- `src/app/(dashboard)/dashboard/schedule/_components/RefineScheduleDialog.tsx`

**Snapshotting for Undo:**

```typescript
ScheduleSnapshot {
  userId: string,
  scheduleId: ObjectId,
  shifts: ShiftDTO[],  // Complete copy of all shifts
  createdAt: Date,
  reason: 'pre_ai_refinement' | 'manual_backup',
  description: string,  // "Before AI refinement: 'Add more grill coverage Friday'"
}

ScheduleSnapshotService = {
  async createSnapshot(userId, scheduleId, reason): Promise<string>,
  async restoreSnapshot(userId, snapshotId): Promise<void>,
  async listSnapshots(userId, scheduleId): Promise<SnapshotDTO[]>,
};
```

**Refinement Flow:**

1. Create snapshot of current schedule (for undo)
2. AI analyzes request + current schedule + available candidates
3. AI suggests specific changes (add shift, swap, etc.)
4. Show diff: current vs proposed
5. User accepts/rejects individual changes
6. If user wants to undo, restore from snapshot

> **Context for Cursor:** "Add schedule refinement with snapshot support. Before any AI refinement, create a ScheduleSnapshot that captures all current shifts. Create RefineScheduleDialog with a text input for natural language requests. The AI should analyze the request and suggest specific changes, shown as a diff (added/removed/modified). Allow accepting individual changes. Add 'Restore Previous' button that restores from the most recent snapshot."

---

### Sprint 3.11: Coverage Validation & Gap Detection

**Scope:** Real-time coverage analysis comparing shifts to requirements.

**Files to Create:**

- `src/server/services/coverage-analyzer.service.ts`
- `src/app/(dashboard)/dashboard/schedule/_components/CoverageBar.tsx`
- `src/app/(dashboard)/dashboard/schedule/_components/CoverageDetailPopover.tsx`

**Service Methods:**

```typescript
CoverageAnalyzerService = {
  analyzeCoverage(shifts, requirements, weekStart): CoverageAnalysis,
  findGaps(analysis): CoverageGap[],
  findOverstaffed(analysis): OverstaffedPeriod[],
}

interface CoverageAnalysis {
  byDay: Record<string, DayCoverage>;  // Keyed by ISO date string: YYYY-MM-DD
  overallScore: number;  // 0-100
  criticalGaps: number;
  warnings: number;
  // Labor cost tracking (requires hourlyRate from Staff model)
  totalScheduledHours: number;      // Sum of all shift hours
  totalLaborCost: number;           // Sum of (hours × hourlyRate) for all shifts
  costByDay: Record<string, number>; // Keyed by ISO date string: YYYY-MM-DD
}
```

**Note:** Use ISO date keys (`YYYY-MM-DD`) instead of `Map<Date, ...>`. Maps and Date keys are not JSON-serializable for Server Actions and TanStack Query caching. Reconstruct Dates in the UI as needed.

**UI:**

- Color-coded bar under each day column (green=covered, yellow=understaffed, red=critical gap)
- Click bar to see detailed breakdown by station and time
- Overall week coverage score in header
- **Labor cost summary** in schedule header: "Total: $X,XXX.XX (XXX hours)" with daily breakdown on hover

> **Context for Cursor:** "Create a coverage analyzer service that compares current shifts against labor requirements. For each 30-minute block, calculate if minimum staffing is met. Also calculate labor costs using hourlyRate from Staff model (added in Sprint 3.3): compute totalScheduledHours, totalLaborCost (sum of hours × hourlyRate), and costByDay breakdown. IMPORTANT: CoverageAnalysis must be JSON-serializable—use ISO date keys (`YYYY-MM-DD`) with `Record<string, ...>` instead of `Map<Date, ...>`. Create a `CoverageBar` component that displays under each day in the schedule grid. Use color coding: green (100%+), yellow (75-99%), red (<75%). Add a popover showing detailed breakdown by station when clicked. Display labor cost summary in schedule header with daily breakdown on hover."

---

### Sprint 3.12: Phase 3 Testing & Polish

**Scope:** Verification script and final polish for hybrid AI scheduling.

**Files to Create:**

- `scripts/test-phase-3.ts`
- Update `package.json` with `test:phase-3` script

**Test Cases:**

1. Labor requirement CRUD
2. Staff availability CRUD
3. **CandidateService filters correctly** (core of hybrid approach)
4. AI scheduler receives only valid candidates
5. **Validator catches AI mistakes** (double-booking, etc.)
6. **Self-correction loop works** (retry with errors)
7. Coverage analyzer correctly identifies gaps
8. Snapshots save and restore correctly
9. AI usage tracking and limits work

**Polish Items:**

- Error handling for OpenAI rate limits/failures
- Retry logic with exponential backoff
- Clear error messages when generation fails
- Loading states throughout
- Usage limit warnings before generation

> **Context for Cursor:** "Create a Phase 3 verification script that tests the hybrid AI scheduling pipeline. Key tests: (1) CandidateService correctly filters invalid staff, (2) AI receives only valid candidates, (3) Validator catches any AI mistakes, (4) Self-correction loop retries with error context, (5) Snapshots work for undo. Mock the OpenAI response for deterministic testing. Add npm script."

---

## Phase 4: The Reactive Hotline (LLM-Powered SMS Automation)

**Goal:** Autonomous handling of employee requests via SMS with graduated human oversight.

**Key Differentiator:** The LLM agent doesn't just parse messages—it can autonomously handle common scenarios based on confidence levels, with a gradient from full automation to manager approval.

**Critical Risk Mitigation:** If the AI accidentally approves a call-out leaving the kitchen empty, the manager will uninstall the app. We implement a **Confidence Threshold System** to prevent this.

---

### Confidence Threshold System (Human-in-the-Loop Gradient)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONFIDENCE-BASED ACTION ROUTING                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HIGH CONFIDENCE (≥90%)                                                      │
│  └─► Auto-handle: Execute action, send response, log for manager review     │
│      Example: "Can't make it today, sick" → Clear intent, auto-find coverage│
│                                                                              │
│  MEDIUM CONFIDENCE (70-89%)                                                  │
│  └─► Draft & Wait: Draft the SMS response, but wait for Manager to click    │
│      "Send" in the Inbox. Show suggested action with reasoning.              │
│      Example: "Running late" → Is it 10 min or 2 hours? Draft, don't send.  │
│                                                                              │
│  LOW CONFIDENCE (<70%)                                                       │
│  └─► Escalate Immediately: Notify manager, show raw message + AI's best     │
│      guess. Manager takes manual action.                                     │
│      Example: "Can John cover for me?" → Which shift? Who is John? Escalate.│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Sprint 4.1: Twilio Integration & Message Storage

**Scope:** SMS webhook handling and message persistence.

**Files to Create:**

- `src/app/api/webhooks/twilio/route.ts`
- `src/server/models/Message.ts`
- `src/server/services/message.service.ts`
- `src/server/actions/message.actions.ts`
- `src/lib/validations/message.schema.ts`
- `src/types/message.ts`

**Schema Design:**

```typescript
Message {
  userId: string,          // Kitchen owner (for multi-tenant)
  staffId: ObjectId,       // Matched staff member (or null)
  provider: 'twilio',      // SMS provider
  providerMessageId?: string, // Twilio MessageSid (idempotency for inbound)
  from: string,            // Phone number
  to: string,              // Twilio number
  body: string,            // Raw message text
  direction: 'inbound' | 'outbound',
  status: 'received' | 'processing' | 'handled' | 'escalated' | 'pending_approval' | 'failed',

  // AI-parsed fields (populated after processing)
  intent: 'CALL_OUT' | 'LATE' | 'SHIFT_SWAP' | 'AVAILABILITY_CHANGE' | 'QUESTION' | 'OTHER',
  parsedData: {
    date?: Date,
    reason?: string,
    requestedAction?: string,
    confidence: number,        // 0-100, determines routing
    confidenceLevel: 'high' | 'medium' | 'low',  // Derived from confidence
  },

  // For conversation threading (critical for stateless SMS)
  threadId: string,              // Group conversation messages
  currentIntentContext: string,  // What the AI is currently waiting for a response about

  // Draft response (for medium confidence - pending manager approval)
  draftResponse?: string,
  suggestedAction?: string,

  // Resolution tracking
  handledBy: 'ai' | 'manager',
  resolution: string,

  createdAt: Date,
}

// Also update Staff model to add SMS consent (TCPA compliance):
Staff {
  ...existing,
  smsConsent: boolean,      // Default false - REQUIRED for SMS processing
  smsConsentDate?: Date,    // When consent was given
  smsOptOutDate?: Date,     // When STOP was received (opt-out timestamp)
  phone: string,            // Normalized to E.164 format (e.g., +12345678900)
}
```

**Webhook Logic:**

1. Validate Twilio signature
2. Extract Twilio identifiers (MessageSid) and basic fields (From, To, Body)
3. **Idempotency:** If a message with the same `providerMessageId` (MessageSid) is already stored, do not reprocess—return TwiML OK.
4. Normalize phone numbers to E.164 and attempt to match staff
5. **Always handle keywords:** STOP / START / HELP
   - STOP: set `smsConsent=false`, set `smsOptOutDate=now`, send confirmation
   - START: trigger re-consent flow (keep consistent with your consent policy)
   - HELP: send generic help message
6. **Consent gate:** Only process non-keyword messages from staff with `smsConsent: true`
   - For unknown numbers or non-consented staff, respond with a generic message directing them to contact their manager
7. Save message with status 'received'
8. Trigger async processing (don't block webhook response)

**Indexing / Uniqueness Notes:**

- `Staff.phone` must be normalized to E.164 and indexed.
- Consider a `(userId, phone)` unique constraint to avoid ambiguous lookups in multi-tenant environments.

> **Context for Cursor:** "Create a Twilio webhook at `/api/webhooks/twilio`. Install the twilio package. Validate the request signature using TWILIO_AUTH_TOKEN env var. Extract Twilio MessageSid and store it as `providerMessageId` for idempotency—if the same MessageSid arrives again, do not reprocess. Normalize numbers to E.164 format (e.g., +12345678900) before staff lookup. Always handle STOP/START/HELP keywords: STOP opts the staff out (`smsConsent=false`, set smsOptOutDate), HELP returns a generic help message, START triggers re-consent flow. IMPORTANT: Only process non-keyword messages from staff with smsConsent=true. For unknown numbers or non-consented staff, respond with a generic message directing them to contact their manager. Add/ensure Staff phone is indexed and consider `(userId, phone)` uniqueness. Save the message with status 'received' and trigger async processing."

---

### Sprint 4.2: Message Processing Agent with Confidence Routing

**Scope:** LLM agent that routes actions based on confidence levels.

**Files to Create:**

- `src/server/services/ai/message-agent.service.ts`
- `src/server/services/ai/prompts/message-parsing.ts`
- `src/server/services/ai/prompts/response-generation.ts`
- `src/lib/sms/twilio-client.ts`

**Agent Capabilities:**

```typescript
MessageAgentService = {
  // Parse intent and extract structured data WITH confidence score
  async parseMessage(message: MessageDTO, threadContext?: ThreadContext): Promise<ParsedMessage>,

  // Route based on confidence level
  async routeByConfidence(parsed: ParsedMessage, context: MessageContext): Promise<RoutingDecision>,

  // Execute autonomous handling (HIGH confidence only)
  async handleAutonomously(parsed: ParsedMessage, context: MessageContext): Promise<HandlingResult>,

  // Draft response for approval (MEDIUM confidence)
  async draftForApproval(parsed: ParsedMessage, context: MessageContext): Promise<DraftResponse>,

  // Generate response SMS
  async generateResponse(result: HandlingResult): Promise<string>,

  // Send SMS via Twilio
  async sendResponse(to: string, body: string): Promise<void>,
}

interface RoutingDecision {
  route: 'auto_handle' | 'draft_and_wait' | 'escalate';
  confidence: number;
  reasoning: string;
}
```

**Confidence-Based Routing:**

```typescript
function routeByConfidence(
  confidence: number,
): "auto_handle" | "draft_and_wait" | "escalate" {
  if (confidence >= 90) return "auto_handle";
  if (confidence >= 70) return "draft_and_wait";
  return "escalate";
}
```

**Handling by Route:**

- **auto_handle**: Execute action immediately, send SMS, mark as 'handled'
- **draft_and_wait**: Save draft response, mark as 'pending_approval', show in Inbox
- **escalate**: Mark as 'escalated', show in Inbox with raw message + AI analysis

> **Context for Cursor:** "Create a message processing agent with confidence-based routing. The AI should parse messages and return a confidence score (0-100). Based on confidence: ≥90 auto-handles, 70-89 drafts response for manager approval, <70 escalates. Store `draftResponse` and `suggestedAction` for pending_approval status. Create a Twilio client wrapper for sending SMS. Use function calling for structured extraction."

---

### Sprint 4.3: Background Message Processing

**Scope:** Async processing queue for messages.

**Files to Create:**

- `src/server/services/message-processor.service.ts`
- `src/server/actions/message-processing.actions.ts`
- Update `src/app/api/webhooks/twilio/route.ts` - Trigger processing

**Processing Flow:**

```
Webhook receives message
    → Save to DB (status: received)
    → Trigger Inngest job for async processing
    → Parse with AI (status: processing)
    → Attempt autonomous handling
        → Success: Update status to 'handled', send response
        → Cannot handle: Update status to 'escalated', notify manager
```

**Implementation:**

Use **Inngest** for reliable background job processing. This is required for:

- Async message processing after webhook (avoid webhook timeouts)
- Waterfall SMS timeouts (15-minute delays between candidates)
- Scheduled reminders (day-before shift notifications)

**Dependencies to Install:**

```bash
npm install inngest
```

**Inngest Functions to Create:**

1. `message.received` - Process incoming SMS after webhook saves it
2. `coverage.waterfall-step` - Send next candidate SMS after 15-min timeout
3. `shift.reminder` - Day-before shift reminders (scheduled)

**Setup:**

- Create `/api/inngest` route for Inngest webhook
- Configure Inngest client with `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`
- Create functions in `src/inngest/` directory
- Use Inngest dev server for local development

> **Context for Cursor:** "Create a message processing service that runs after webhook saves the message. Use **Inngest** for background job processing. Install inngest package. Create Inngest functions: (1) message.received - processes SMS using MessageAgentService from Sprint 4.2, (2) coverage.waterfall-step - handles 15-min timeouts for coverage requests, (3) shift.reminder - scheduled day-before reminders. Set up Inngest client with proper env vars. Create `/api/inngest` route for Inngest webhook. Update message status as it progresses through stages. If autonomous handling succeeds, send response SMS and mark as 'handled'. If it fails or is uncertain, mark as 'escalated' and send manager notification (for now, just log it). Handle errors gracefully—don't lose messages."

---

### Sprint 4.4: Manager Inbox Dashboard

**Scope:** UI for managers to review messages and handle escalations.

**Files to Create:**

- `src/app/(dashboard)/dashboard/inbox/page.tsx`
- `src/app/(dashboard)/dashboard/inbox/_components/MessageList.tsx`
- `src/app/(dashboard)/dashboard/inbox/_components/MessageDetail.tsx`
- `src/app/(dashboard)/dashboard/inbox/_components/MessageFilters.tsx`
- `src/app/(dashboard)/dashboard/inbox/_components/QuickActions.tsx`

**UI Design:**

```
┌─────────────────────────────────────────────────────────┐
│ Inbox                               [Filter ▼] [Refresh]│
├───────────────────────┬─────────────────────────────────┤
│ Messages              │ Message Detail                   │
├───────────────────────┤                                  │
│ 🔴 John S. - Call Out │ From: John Smith                 │
│    "Can't make it..." │ Received: 2 hours ago            │
│    2 hours ago        │                                  │
├───────────────────────┤ "Hey, I'm really sick and can't  │
│ ✅ Jane D. - Late     │  make it to my shift tonight..." │
│    "Running 15 min.." │                                  │
│    AI Handled ✓       │ ─────────────────────────────────│
├───────────────────────┤ AI Analysis:                     │
│ 🟡 Bob M. - Swap      │ • Intent: Call Out (95%)         │
│    "Can someone..."   │ • Shift: Today 5pm-10pm (Grill)  │
│    Escalated          │ • Reason: Illness                │
└───────────────────────┤                                  │
                        │ Suggested Actions:               │
                        │ [Find Coverage] [Approve] [Reply]│
                        └─────────────────────────────────┘
```

**Features:**

- Filter by status (all, escalated, handled, pending)
- Real-time updates (polling or WebSocket)
- Quick actions based on intent
- Reply directly from dashboard

> **Context for Cursor:** "Build an inbox page at `/dashboard/inbox`. Use a split-pane layout: message list on left, detail on right. Fetch messages using TanStack Query. Show status indicators (handled=green, escalated=red, processing=yellow). When selecting a message, show full details including AI analysis. Add quick action buttons based on intent type. Add inbox link to dashboard navigation."

---

### Sprint 4.5: Coverage Request Automation

**Scope:** Automated workflow for finding shift coverage.

**Files to Create:**

- `src/server/services/coverage-request.service.ts`
- `src/server/actions/coverage-request.actions.ts`
- `src/server/models/CoverageRequest.ts`
- `src/app/(dashboard)/dashboard/inbox/_components/CoverageRequestFlow.tsx`

**Schema Design:**

```typescript
CoverageRequest {
  messageId: ObjectId,     // Original request message
  shiftId: ObjectId,       // Shift needing coverage
  requestedBy: ObjectId,   // Staff who called out
  status: 'searching' | 'offered' | 'accepted' | 'declined' | 'expired',

  // Waterfall strategy tracking
  strategy: 'waterfall',   // Text one at a time, wait for response
  currentCandidateIndex: number,  // Which candidate we're currently waiting on
  waitTimeMinutes: number,        // How long to wait before moving to next (default 15)

  candidates: [{
    staffId: ObjectId,
    priority: number,      // 1 = best fit, 2 = second best, etc.
    status: 'pending' | 'offered' | 'accepted' | 'declined' | 'no_response' | 'skipped',
    offeredAt: Date,
    responseDeadline: Date,
    respondedAt: Date,
    declineReason?: string,
    offerMessageId?: ObjectId, // Link to outbound Message record (if stored)
    offerToken?: string,       // Correlation token included in outbound SMS
  }],

  acceptedBy: ObjectId,    // Staff who took the shift
  expiresAt: Date,         // Auto-expire entire request if no one accepts
}
```

**Waterfall Strategy (NOT Blast):**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WRONG: Blast all 10 candidates at once                                     │
│  └─► Annoying, costly, confusing when multiple people say "yes"             │
│                                                                              │
│  RIGHT: Waterfall approach                                                   │
│  1. Text BEST candidate (highest skill match, needs hours, etc.)            │
│  2. Wait 15 minutes for response                                            │
│  3. If no response or decline → Text NEXT candidate                         │
│  4. Repeat until accepted or all candidates exhausted                        │
│  5. If all decline/timeout → Escalate to manager                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Automation Flow:**

1. AI identifies CALL_OUT with shift (high confidence)
2. CandidateService finds available staff, ranked by priority
3. Create CoverageRequest with waterfall strategy
4. Text candidate #1 with a correlation token → "Can you cover John's 5pm-10pm Grill shift today? Reply YES 3F2A or NO 3F2A"
5. Wait 15 min (requires Inngest job scheduling)
6. On YES (matched to correct offer/request) → Assign shift, notify all parties, stop waterfall
7. On NO or timeout → Move to candidate #2, repeat
8. If all exhausted → Mark as 'expired', escalate to manager

**Correlation & Concurrency Rules (Critical):**

- Correlation: outbound offers must include a lightweight correlation token so inbound YES/NO replies map to the correct CoverageRequest + candidate offer.
- First valid acceptance wins. Late acceptances after the request is filled must receive an automatic "Already filled" response.
- Prevent multiple concurrent waterfall steps for the same CoverageRequest (use Inngest concurrency keys or service-level locking).

> **Context for Cursor:** "Create a coverage request system using WATERFALL strategy (NOT blast). When a call-out is detected, rank candidates by priority (skill match, hours needed, availability preference). Text the BEST candidate first. Use Inngest for the 15-minute wait and waterfall progression. Correlate inbound replies to the correct request by including an `offerToken` in the outbound SMS and storing it in the CoverageRequest candidate entry (also store offerMessageId if tracking outbound Message). Concurrency rules: first valid acceptance wins; late acceptances get an automatic 'Already filled' response. Prevent multiple concurrent waterfall steps for the same request (Inngest concurrency key or service locking). Track `currentCandidateIndex` and `responseDeadline`. Escalate to manager if all candidates exhausted."

---

### Sprint 4.6: Conversation Threading & Context

**Scope:** Multi-turn conversation handling.

**Files to Update/Create:**

- Update `src/server/models/Message.ts` - Add threading
- `src/server/services/conversation.service.ts`
- Update `src/server/services/ai/message-agent.service.ts` - Use thread context

**Threading Logic:**

- Group messages by phone number + time window (30 min)
- Include previous messages in AI context for parsing
- Handle follow-up clarifications

**Example Conversation:**

```
Employee: "Can't work tomorrow"
AI: "I see you have a shift tomorrow 5pm-10pm at Grill. Are you calling out for this shift?"
Employee: "Yes"
AI: "Got it. I'm looking for coverage now. What's the reason for your call-out?"
Employee: "Sick"
AI: "Thanks, I've marked your call-out as sick leave. I've reached out to 3 teammates who can cover. I'll text you when I find coverage."
```

> **Context for Cursor:** "Add conversation threading to the message system. When a new message arrives, check for recent messages (last 30 min) from the same number and link them via threadId. When parsing with AI, include the full thread for context. Handle cases where the AI needs clarification—generate a question and send it, then wait for response before proceeding."

---

### Sprint 4.7: Outbound Notifications

**Scope:** Proactive notifications to staff.

**Files to Create:**

- `src/server/services/notification.service.ts`
- `src/server/actions/notification.actions.ts`
- `src/app/(dashboard)/dashboard/schedule/_components/NotifyStaffButton.tsx`

**Notification Types:**

- Schedule published → Send shifts to all scheduled staff
- Shift assigned/changed → Notify affected staff
- Coverage request → Ask available staff
- Shift reminder → Day-before reminder

**Service Methods:**

```typescript
NotificationService = {
  async notifySchedulePublished(scheduleId: string): Promise<void>,
  async notifyShiftChange(shiftId: string, changeType: 'created' | 'updated' | 'deleted'): Promise<void>,
  async sendReminders(date: Date): Promise<void>,
}
```

> **Context for Cursor:** "Create a notification service for outbound SMS. Add a 'Notify Staff' button to the schedule page that sends each scheduled employee their shifts for the week. Messages should be formatted nicely. Track outbound messages in the Message collection with direction='outbound'. Use the Twilio client from Sprint 4.2. Respect rate limits."

---

### Sprint 4.8: Phase 4 Testing & Time Travel Tool

**Scope:** Verification, robustness, and testing utilities for time-dependent flows.

**Files to Create:**

- `scripts/test-phase-4.ts`
- `src/lib/testing/time-travel.ts` - Dev tool for testing time-dependent flows
- Update `package.json` with `test:phase-4` script

**Time Travel Tool (Critical for Testing):**

Testing the waterfall SMS flow is hard because it depends on time passing (waiting for replies, timeout after 15 min). Create a dev-only "Time Travel" tool:

```typescript
// src/lib/testing/time-travel.ts (dev only)
export const TimeTravel = {
  /**
   * Fast-forward all pending CoverageRequest deadlines
   * Makes the "15 min wait" expire immediately for testing
   */
  async expirePendingOffers(requestId: string): Promise<void>,

  /**
   * Simulate "no response" scenario
   * Triggers the waterfall to move to next candidate
   */
  async simulateNoResponse(requestId: string): Promise<void>,

  /**
   * Process all pending timeouts as if time has passed
   */
  async processAllTimeouts(): Promise<number>,
};
```

**Test Cases:**

1. Webhook receives and stores message correctly
2. AI parses various message formats (test edge cases)
3. **Confidence routing works** (high=auto, medium=draft, low=escalate)
4. **Waterfall coverage request** sends to one candidate at a time
5. **Time Travel tool** correctly expires offers and moves to next
6. Conversation threading maintains context (`currentIntentContext`)
7. Error handling for Twilio failures, OpenAI failures

**Error Handling:**

- Retry logic for API failures (exponential backoff)
- Graceful degradation (escalate to manager if AI fails)
- Message status tracking for debugging
- Dead letter queue for failed messages
- Never lose a message—always log and track

> **Context for Cursor:** "Create a Phase 4 verification script. Include a TimeTravel dev utility for testing time-dependent flows (waterfall timeouts, offer expiration). Test: (1) confidence routing (high/medium/low), (2) waterfall sends one SMS at a time, (3) timeout triggers next candidate, (4) conversation threading with currentIntentContext. Mock Twilio and OpenAI for deterministic tests. The TimeTravel tool should only be available in development."

---

## Phase 5: Production Preparation

**Goal:** Security, access control, mobile experience, and deployment readiness.

**Future Consideration (Post-MVP):** The Phase 4 Inbox currently uses TanStack Query polling for updates. For a truly "reactive" experience where managers see incoming texts instantly, consider adding Server-Sent Events (SSE) or a service like Pusher in a future iteration. Polling is acceptable for MVP.

---

### Sprint 5.1: Role-Based Access Control (RBAC)

**Scope:** Secure the app based on user roles.

**Files to Create/Update:**

- `src/lib/auth/rbac.ts` - Permission definitions
- `src/lib/auth/check-permission.ts` - Permission checker
- Update all server actions with role checks
- `src/types/auth.ts` - Role types

**Role Definitions:**

```typescript
const ROLES = {
  owner: {
    permissions: ["*"], // All permissions
  },
  manager: {
    permissions: [
      "schedule:read",
      "schedule:write",
      "schedule:publish",
      "staff:read",
      "staff:write",
      "inbox:read",
      "inbox:handle",
      "labor:read",
      "labor:write",
    ],
  },
  staff: {
    permissions: [
      "schedule:read:own", // Only own shifts
      "availability:write:own",
    ],
  },
};
```

**Implementation:**

- Store role in Clerk publicMetadata
- Create `checkPermission(userId, permission)` helper
- Add permission checks to all server actions
- Update UI to hide unauthorized actions

> **Context for Cursor:** "Implement RBAC using Clerk public metadata. Create a permissions system with owner/manager/staff roles. Add a `checkPermission` helper that reads the user's role from Clerk and checks against required permission. Update ALL existing server actions to check permissions before proceeding. Return 403 for unauthorized requests."

---

### Sprint 5.2: Staff Self-Service Portal

**Scope:** Mobile-friendly view for staff to see their schedules.

**Files to Create:**

- `src/app/(staff)/layout.tsx` - Staff layout (no sidebar)
- `src/app/(staff)/my-shifts/page.tsx`
- `src/app/(staff)/my-shifts/_components/ShiftList.tsx`
- `src/app/(staff)/my-shifts/_components/ShiftDetail.tsx`
- `src/app/(staff)/my-availability/page.tsx`

**UI Design (Mobile-First):**

```
┌─────────────────────┐
│ My Shifts           │
│ Week of Jan 20      │
├─────────────────────┤
│ Mon Jan 20          │
│ ┌─────────────────┐ │
│ │ 9am - 5pm       │ │
│ │ Grill Station   │ │
│ └─────────────────┘ │
├─────────────────────┤
│ Tue Jan 21          │
│ ┌─────────────────┐ │
│ │ 2pm - 10pm      │ │
│ │ Prep Station    │ │
│ └─────────────────┘ │
└─────────────────────┘
```

**Features:**

- View upcoming shifts
- Update own availability
- Request time off (creates TimeOffRequest for manager approval)
- Claim open shifts

> **Context for Cursor:** "Create a mobile-first staff portal. Use a separate route group `(staff)` with a minimal layout (no sidebar, just header with logout). Staff should see their upcoming shifts in a vertical card list. Add a bottom nav with 'My Shifts' and 'Availability' tabs. Only show shifts belonging to the logged-in staff member. Use RBAC to enforce access."

---

### Sprint 5.3: Settings & Configuration Improvements

**Scope:** Admin settings and environment configuration.

**Files to Create/Update:**

- `src/app/(dashboard)/dashboard/settings/page.tsx` - Enhance
- `src/app/(dashboard)/dashboard/settings/_components/IntegrationSettings.tsx`
- `src/app/(dashboard)/dashboard/settings/_components/NotificationSettings.tsx`
- `src/app/(dashboard)/dashboard/settings/_components/TeamSettings.tsx`

**Settings Sections:**

- **Kitchen Config** (existing)
- **Integrations**: Twilio phone number, OpenAI API key status
- **Notifications**: Enable/disable SMS, reminder timing
- **Team**: Invite managers, manage roles
- **Billing**: (placeholder for future)

> **Context for Cursor:** "Enhance the settings page with tabbed sections. Add an Integrations tab showing connected services (Twilio, OpenAI) with status indicators. Add a Notifications tab for configuring SMS settings (enable shift reminders, reminder time). Add a Team tab for viewing/managing team members and their roles. Use Shadcn Tabs component."

---

### Sprint 5.4: Error Boundaries & Loading States

**Scope:** Production-grade error handling and UX.

**Files to Create:**

- `src/app/error.tsx` - Root error boundary
- `src/app/(dashboard)/error.tsx` - Dashboard error boundary
- `src/app/(dashboard)/dashboard/schedule/error.tsx` - Feature error boundary
- `src/app/(dashboard)/dashboard/schedule/loading.tsx` - Feature loading
- `src/components/shared/ErrorFallback.tsx`
- `src/components/shared/LoadingSkeleton.tsx`

**Error Handling Strategy:**

- Catch errors at feature boundary
- Show user-friendly error message
- Provide retry option
- Log errors to console (or future monitoring service)

**Loading States:**

- Skeleton UI for initial data load
- Inline loading for mutations
- Optimistic updates where appropriate

> **Context for Cursor:** "Add production error handling. Create error.tsx files at root, dashboard, and feature levels that catch and display errors nicely. Create loading.tsx files with skeleton UI for each major feature. Wrap async data fetching in Suspense boundaries. Ensure users see helpful messages, not crashes."

---

### Sprint 5.5: Performance Optimization

**Scope:** Optimize for production performance.

**Tasks:**

- Add database indexes review
- Implement query caching strategy
- Add React Server Component optimizations
- Image optimization (if any)
- Bundle analysis

**Files to Create/Update:**

- `src/lib/cache.ts` - Caching utilities
- Review all Mongoose models for indexes
- Add `loading.tsx` for remaining routes

**Optimizations:**

- TanStack Query cache tuning (staleTime, gcTime)
- Mongoose lean queries where appropriate
- Avoid N+1 queries in list endpoints
- Parallel data fetching

> **Context for Cursor:** "Optimize the app for production. Review all Mongoose models and ensure appropriate indexes exist. Add compound indexes for common query patterns. Review TanStack Query configurations—set appropriate staleTime for infrequently changing data (kitchen config). Use lean() for read-only queries. Identify and fix any N+1 query patterns in the services."

---

### Sprint 5.6: Environment & Deployment Configuration

**Scope:** Prepare for deployment.

**Files to Create:**

- `src/lib/env.ts` - Type-safe environment variables
- `.env.example` - Document required env vars
- `scripts/verify-env.ts` - Validate environment before start
- Update `README.md` with deployment instructions

**Environment Variables:**

```
# Database
MONGODB_URI=

# Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# AI
OPENAI_API_KEY=

# SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# App
NEXT_PUBLIC_APP_URL=
```

**Deployment Checklist:**

- [ ] All env vars documented and validated
- [ ] Database indexes created
- [ ] Clerk webhooks configured
- [ ] Twilio webhooks configured
- [ ] Error monitoring setup (optional)
- [ ] Analytics setup (optional)

> **Context for Cursor:** "Create deployment configuration. Build a type-safe env loader that validates all required variables on startup. Create a verification script that checks environment is complete. Document all env vars in .env.example with descriptions. Update README with deployment instructions for Vercel. Add a health check endpoint at `/api/health`."

---

### Sprint 5.7: Final Testing & Documentation

**Scope:** End-to-end testing and documentation.

**Files to Create:**

- `scripts/test-e2e.ts` - Full integration test
- Update `README.md` - Complete documentation
- `DEPLOYMENT.md` - Deployment guide
- `plans/PHASE-5-COMPLETE.md` - Completion report

**Test Scenarios:**

1. New user signup → Configure kitchen → Add staff → Create schedule
2. AI generates schedule → User refines → Publishes
3. Staff calls out via SMS → AI finds coverage → Shift reassigned
4. Staff views their schedule via mobile portal

**Documentation:**

- Architecture overview
- Local development setup
- Deployment instructions
- API documentation (if external APIs exist)

> **Context for Cursor:** "Create comprehensive documentation. Write a complete README with project overview, tech stack, local setup instructions, and architecture summary. Create DEPLOYMENT.md with step-by-step Vercel deployment guide. Create a final e2e test script that exercises all major flows. Document any gotchas or known issues."

---

## Appendix: Sprint Sizing Guide

Each sprint is designed to be completable in **1-2 coding agent sessions** (approximately 2-4 hours of focused AI-assisted development).

| Sprint Size | Characteristics                                 |
| ----------- | ----------------------------------------------- |
| Small       | Single model/service + basic UI component       |
| Medium      | Multiple related files + moderate UI complexity |
| Large       | Cross-cutting feature + multiple integrations   |

**If a sprint feels too large**, split it:

1. Data layer first (model + service + action)
2. UI second (page + components)
3. Integration third (connecting pieces)

---

## Progress Tracking

| Phase   | Status      | Sprints | Est. Sessions |
| ------- | ----------- | ------- | ------------- |
| Phase 1 | ✅ Complete | 3       | -             |
| Phase 2 | ✅ Complete | 4       | -             |
| Phase 3 | 🔜 Next     | 14      | 20-28         |
| Phase 4 | ⏳ Planned  | 8       | 12-16         |
| Phase 5 | ⏳ Planned  | 7       | 10-14         |

**Total Remaining:** ~29 sprints, ~42-58 coding sessions

### Phase 3 Key Architecture Changes (Hybrid Approach)

- **Sprint 3.4a/3.4b**: TimeOffRequests (date-range) + approval workflow
- **Sprint 3.5**: CandidateService (Hard Filter) - filter BEFORE AI
- **Sprint 3.6**: OpenAI Client + AI Cost Tracking
- **Sprint 3.7**: SchedulingAgentService (Soft Selector) - AI picks from valid only
- **Sprint 3.8**: ScheduleValidatorService + Self-Correction Loop
- **Sprint 3.10**: Snapshotting for undo capability

### Phase 4 Key Risk Mitigations

- **Confidence Thresholds**: High=auto, Medium=draft, Low=escalate
- **Waterfall SMS**: Text one candidate at a time, not blast
- **State Management**: `threadId` + `currentIntentContext` for SMS threading
- **Time Travel Tool**: Dev utility for testing time-dependent flows

---

_Last Updated: January 2026_
