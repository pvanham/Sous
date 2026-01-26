# SOUS: MASTER BUILD PLAN & ROADMAP

**Project Goal:** A reactive, AI-powered scheduling platform for high-volume kitchens.

**Differentiator:** LLM-powered automation throughout—from intelligent schedule generation to autonomous employee request handling.

---

## Tech Stack & Architecture (Enforced)

| Category | Technology |
|----------|------------|
| **Core** | Next.js 16 (App Router), React 19, TypeScript 5 |
| **Styling** | Tailwind CSS v4 (CSS-first), shadcn/ui (Radix), lucide-react |
| **Database** | MongoDB Atlas + Mongoose 9 |
| **State** | TanStack Query v5 (client), Server Actions (mutations) |
| **Auth** | Clerk (`@clerk/nextjs`) |
| **Validation** | Zod + React Hook Form |
| **AI/LLM** | OpenAI API (GPT-4o), Vercel AI SDK |
| **SMS** | Twilio (Phase 4) |

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

## Phase 3: The "Sous" Agent (AI Schedule Generation)

**Goal:** One-click intelligent schedule generation powered by LLM reasoning + heuristics.

**Key Differentiator:** Unlike simple auto-fill, Sous uses LLM to understand context (holiday rushes, staff preferences, skill gaps) and explain its scheduling decisions.

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
}
```

**Service Methods:**
- `getByStaffId(staffId)` - All availability for a staff member
- `getAvailableStaff(userId, dayOfWeek, startTime, endTime)` - Find who can work a slot
- `bulkUpsert(userId, staffId, availabilities[])` - Set weekly availability

> **Context for Cursor:** "Create a `StaffAvailability` model for storing when staff can/prefer to work. Add fields to the existing Staff model for constraints (maxHoursPerWeek, minHoursPerWeek, preferredStations). Create service methods that can query available staff for a given time slot. Follow the 3-layer architecture."

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

### Sprint 3.5: AI Scheduling Service Foundation

**Scope:** Core AI service with context building and OpenAI integration.

**Files to Create:**
- `src/server/services/ai/scheduling-agent.service.ts`
- `src/server/services/ai/prompt-builder.ts`
- `src/server/services/ai/schedule-parser.ts`
- `src/lib/ai/openai-client.ts`
- `src/types/ai-scheduling.ts`

**Dependencies to Install:**
```bash
npm install openai ai
```

**Service Design:**
```typescript
// scheduling-agent.service.ts
export const SchedulingAgentService = {
  // Build context from all data sources
  async buildSchedulingContext(userId: string, weekStart: Date): Promise<SchedulingContext>,
  
  // Generate schedule using LLM
  async generateSchedule(context: SchedulingContext): Promise<GeneratedSchedule>,
  
  // Validate generated schedule against hard constraints
  async validateSchedule(schedule: GeneratedSchedule, context: SchedulingContext): Promise<ValidationResult>,
  
  // Apply generated schedule to database
  async applySchedule(userId: string, scheduleId: string, shifts: GeneratedShift[]): Promise<ApplyResult>,
};

// Types
interface SchedulingContext {
  kitchenConfig: KitchenConfigDTO;
  laborRequirements: LaborRequirementDTO[];
  staff: StaffWithAvailabilityDTO[];
  existingShifts: ShiftDTO[];
  weekStart: Date;
}

interface GeneratedShift {
  staffId: string;
  staffName: string;  // For display
  station: string;
  date: Date;
  startTime: string;
  endTime: string;
  reasoning: string;  // Why this assignment was made
}
```

> **Context for Cursor:** "Create an AI scheduling service that integrates with OpenAI. First, create an OpenAI client wrapper in `src/lib/ai/openai-client.ts` that handles API calls with proper error handling. Then create `SchedulingAgentService` with methods to: (1) build context from labor requirements, staff availability, and kitchen config, (2) call OpenAI to generate a schedule, (3) parse the response into typed shift objects. Do NOT create UI yet."

---

### Sprint 3.6: AI Scheduling Prompt Engineering

**Scope:** Craft the prompts that make the AI scheduler intelligent.

**Files to Update/Create:**
- `src/server/services/ai/prompt-builder.ts` - Complete implementation
- `src/server/services/ai/prompts/schedule-generation.ts` - Prompt templates
- `src/server/services/ai/prompts/shift-reasoning.ts` - Explanation prompts

**System Prompt Structure:**
```
You are Sous, an expert kitchen scheduling assistant. Your job is to create 
optimal staff schedules that:

1. MUST satisfy all labor requirements (minimum staff per station per time block)
2. MUST respect staff availability (never schedule unavailable staff)
3. MUST respect constraints (max hours, no overlapping shifts)
4. SHOULD prefer staff for their preferred stations
5. SHOULD distribute hours fairly across staff
6. SHOULD minimize overtime when possible

You will receive:
- Labor requirements (station, time, min/preferred staff counts, priority)
- Staff list with availability, skills, max hours, preferences
- Any existing shifts already scheduled
- The week being scheduled (Mon-Sun)

Output a JSON array of shifts with reasoning for each assignment.
```

**Prompt Techniques:**
- Few-shot examples for complex scenarios
- Chain-of-thought for reasoning
- Structured output (JSON mode)

> **Context for Cursor:** "Implement the prompt-builder for the AI scheduler. Create prompt templates that include: (1) system instructions for scheduling logic, (2) context serialization (format labor requirements, staff, and constraints as structured text), (3) output format specification (JSON schema for shifts). Use OpenAI's JSON mode for reliable parsing. Include 2-3 few-shot examples showing good scheduling decisions."

---

### Sprint 3.7: Schedule Generation Action & UI

**Scope:** Wire up AI generation to the schedule page.

**Files to Create/Update:**
- `src/server/actions/schedule-generation.actions.ts`
- Update `src/app/(dashboard)/dashboard/schedule/_components/ScheduleActions.tsx`
- `src/app/(dashboard)/dashboard/schedule/_components/GenerateScheduleDialog.tsx`
- `src/app/(dashboard)/dashboard/schedule/_components/GeneratedShiftPreview.tsx`

**UI Flow:**
1. User clicks "Generate Schedule" button
2. Dialog opens showing current labor requirements summary
3. User confirms → AI generates schedule (loading state with progress)
4. Preview shows generated shifts with AI reasoning
5. User can accept all, accept with modifications, or cancel
6. Accept → Shifts are created in database

**Features:**
- Show AI reasoning for each shift assignment
- Highlight any unfilled requirements (couldn't find available staff)
- Allow user to regenerate with different parameters
- Streaming response for real-time feedback

> **Context for Cursor:** "Create the UI for AI schedule generation. Add a 'Generate Schedule' button to ScheduleActions. When clicked, open a dialog that: (1) shows loading state while AI generates, (2) displays generated shifts in a preview grid, (3) shows AI reasoning for each shift, (4) allows user to accept or cancel. Use the `generateSchedule` server action. On accept, create all shifts via the existing shift creation action."

---

### Sprint 3.8: Schedule Generation Refinement & Feedback

**Scope:** Allow iterative refinement of generated schedules.

**Files to Create/Update:**
- `src/server/services/ai/schedule-refiner.service.ts`
- `src/server/actions/schedule-generation.actions.ts` - Add refine action
- `src/app/(dashboard)/dashboard/schedule/_components/RefineScheduleDialog.tsx`

**Refinement Flow:**
```
User: "I need more coverage on Friday evening for the Grill station"
AI: Analyzes request, finds available staff, suggests modifications
User: Accepts or provides more feedback
```

**Features:**
- Natural language input for refinements
- AI suggests specific shift changes
- Track conversation history for context
- Show diff between original and refined schedule

> **Context for Cursor:** "Add schedule refinement capabilities. Create a text input in the schedule preview where users can type natural language requests like 'Add more grill coverage Friday evening' or 'John can't work Monday anymore'. Send this to a refine endpoint that uses AI to suggest specific shift modifications. Show the diff between original and suggested changes. Allow accepting individual changes."

---

### Sprint 3.9: Coverage Validation & Gap Detection

**Scope:** Real-time coverage analysis comparing shifts to requirements.

**Files to Create:**
- `src/server/services/coverage-analyzer.service.ts`
- `src/app/(dashboard)/dashboard/schedule/_components/CoverageBar.tsx`
- `src/app/(dashboard)/dashboard/schedule/_components/CoverageDetailPopover.tsx`

**Service Methods:**
```typescript
CoverageAnalyzerService = {
  // Compare shifts against labor requirements
  analyzeCoverage(shifts: ShiftDTO[], requirements: LaborRequirementDTO[], weekStart: Date): CoverageAnalysis,
  
  // Get specific gaps
  findGaps(analysis: CoverageAnalysis): CoverageGap[],
  
  // Get overstaffed periods  
  findOverstaffed(analysis: CoverageAnalysis): OverstaffedPeriod[],
}

interface CoverageAnalysis {
  byDay: Map<Date, DayCoverage>;
  overallScore: number;  // 0-100
  criticalGaps: number;
  warnings: number;
}
```

**UI:**
- Color-coded bar under each day column (green=covered, yellow=understaffed, red=critical gap)
- Click bar to see detailed breakdown by station and time
- Overall week coverage score in header

> **Context for Cursor:** "Create a coverage analyzer service that compares current shifts against labor requirements. For each 30-minute block, calculate if minimum staffing is met. Create a `CoverageBar` component that displays under each day in the schedule grid. Use color coding: green (100%+), yellow (75-99%), red (<75%). Add a popover showing detailed breakdown by station when clicked."

---

### Sprint 3.10: Phase 3 Testing & Polish

**Scope:** Verification script and final polish for AI scheduling.

**Files to Create:**
- `scripts/test-phase-3.ts`
- Update `package.json` with `test:phase-3` script

**Test Cases:**
1. Create labor requirements for a week
2. Create staff with varied availability
3. Call AI scheduler and verify output
4. Validate all hard constraints are respected
5. Verify coverage analysis matches generated schedule
6. Test refinement flow

**Polish Items:**
- Error handling for OpenAI rate limits/failures
- Retry logic with exponential backoff
- Cost tracking for AI calls
- Loading states throughout

> **Context for Cursor:** "Create a Phase 3 verification script similar to test-phase-2.ts. Test: (1) labor requirement CRUD, (2) staff availability CRUD, (3) AI schedule generation produces valid shifts, (4) coverage analyzer correctly identifies gaps, (5) all generated shifts respect constraints. Mock the OpenAI response for deterministic testing. Add npm script."

---

## Phase 4: The Reactive Hotline (LLM-Powered SMS Automation)

**Goal:** Autonomous handling of employee requests via SMS with minimal manager intervention.

**Key Differentiator:** The LLM agent doesn't just parse messages—it can autonomously handle common scenarios (find coverage, approve simple requests) and only escalates edge cases to managers.

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
  from: string,            // Phone number
  to: string,              // Twilio number
  body: string,            // Raw message text
  direction: 'inbound' | 'outbound',
  status: 'received' | 'processing' | 'handled' | 'escalated' | 'failed',
  
  // AI-parsed fields (populated after processing)
  intent: 'CALL_OUT' | 'LATE' | 'SHIFT_SWAP' | 'AVAILABILITY_CHANGE' | 'QUESTION' | 'OTHER',
  parsedData: {
    date?: Date,
    reason?: string,
    requestedAction?: string,
    confidence: number,
  },
  
  // Resolution tracking
  handledBy: 'ai' | 'manager',
  resolution: string,
  
  createdAt: Date,
  threadId: string,        // Group conversation messages
}
```

**Webhook Logic:**
1. Validate Twilio signature
2. Find staff by phone number
3. Save message with status 'received'
4. Trigger async processing (don't block webhook response)

> **Context for Cursor:** "Create a Twilio webhook at `/api/webhooks/twilio`. Install the twilio package. Validate the request signature using TWILIO_AUTH_TOKEN env var. Look up the staff member by phone number (normalize format). Save the message to MongoDB with status 'received'. Return TwiML response (empty or acknowledgment). Do NOT process the message yet—that happens async."

---

### Sprint 4.2: Message Processing Agent Service

**Scope:** LLM agent that understands and acts on messages.

**Files to Create:**
- `src/server/services/ai/message-agent.service.ts`
- `src/server/services/ai/prompts/message-parsing.ts`
- `src/server/services/ai/prompts/response-generation.ts`
- `src/lib/sms/twilio-client.ts`

**Agent Capabilities:**
```typescript
MessageAgentService = {
  // Parse intent and extract structured data
  async parseMessage(message: MessageDTO): Promise<ParsedMessage>,
  
  // Determine if AI can handle autonomously
  async canHandleAutonomously(parsed: ParsedMessage, context: MessageContext): Promise<boolean>,
  
  // Execute autonomous handling (find coverage, update availability, etc.)
  async handleAutonomously(parsed: ParsedMessage, context: MessageContext): Promise<HandlingResult>,
  
  // Generate response SMS
  async generateResponse(result: HandlingResult): Promise<string>,
  
  // Send SMS via Twilio
  async sendResponse(to: string, body: string): Promise<void>,
}
```

**Autonomous Handling Rules:**
- **CALL_OUT**: Check for available staff with matching skills → Auto-request coverage
- **LATE**: Update shift notes, notify manager if > 30 min
- **AVAILABILITY_CHANGE**: Update StaffAvailability model
- **SHIFT_SWAP**: Check if swap is feasible, propose to other staff member
- **QUESTION**: Answer simple questions (schedule lookup, etc.)

> **Context for Cursor:** "Create a message processing agent service. It should: (1) parse the message using OpenAI to extract intent and data, (2) decide if it can be handled autonomously based on rules, (3) execute the handling (e.g., for CALL_OUT: find replacement staff, send them request), (4) generate and send response SMS. Create a Twilio client wrapper for sending SMS. Use function calling for structured extraction."

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
    → Trigger async processing (via server action or queue)
    → Parse with AI (status: processing)
    → Attempt autonomous handling
        → Success: Update status to 'handled', send response
        → Cannot handle: Update status to 'escalated', notify manager
```

**Implementation Options:**
- Simple: Call server action from webhook (may timeout)
- Better: Use Next.js background functions or edge function
- Production: Use a job queue (Inngest, Trigger.dev)

> **Context for Cursor:** "Create a message processing service that runs after webhook saves the message. Use the MessageAgentService from Sprint 4.2. Update message status as it progresses through stages. If autonomous handling succeeds, send response SMS and mark as 'handled'. If it fails or is uncertain, mark as 'escalated' and send manager notification (for now, just log it). Handle errors gracefully—don't lose messages."

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
  
  candidates: [{
    staffId: ObjectId,
    status: 'pending' | 'accepted' | 'declined' | 'no_response',
    offeredAt: Date,
    respondedAt: Date,
  }],
  
  acceptedBy: ObjectId,    // Staff who took the shift
  expiresAt: Date,         // Auto-expire if no response
}
```

**Automation Flow:**
1. AI identifies CALL_OUT with shift
2. Find available staff with matching skills
3. Send SMS to candidates in priority order
4. Track responses, assign shift to first accepter
5. Notify original staff member of result

> **Context for Cursor:** "Create an automated coverage request system. When a call-out is detected, find available staff using StaffAvailability and skills matching. Create a CoverageRequest record. Send SMS to up to 3 candidates asking if they can cover. Parse their responses (yes/no). First 'yes' gets assigned the shift. Send confirmation to all parties. Expire requests after 2 hours."

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

### Sprint 4.8: Phase 4 Testing & Error Handling

**Scope:** Verification and robustness.

**Files to Create:**
- `scripts/test-phase-4.ts`
- Update `package.json` with `test:phase-4` script

**Test Cases:**
1. Webhook receives and stores message correctly
2. AI parses various message formats (test edge cases)
3. Autonomous call-out handling finds correct candidates
4. Coverage request SMS flow works end-to-end
5. Conversation threading maintains context
6. Error handling for Twilio failures, OpenAI failures

**Error Handling:**
- Retry logic for API failures
- Graceful degradation (escalate to manager if AI fails)
- Message status tracking for debugging
- Dead letter queue for failed messages

> **Context for Cursor:** "Create a Phase 4 verification script. Test webhook validation, message parsing with various inputs, coverage request flow, and conversation threading. Mock Twilio and OpenAI for deterministic tests. Add comprehensive error handling throughout the message processing pipeline—messages should never be lost. Log errors but don't crash."

---

## Phase 5: Production Preparation

**Goal:** Security, access control, mobile experience, and deployment readiness.

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
    permissions: ['*'],  // All permissions
  },
  manager: {
    permissions: [
      'schedule:read', 'schedule:write', 'schedule:publish',
      'staff:read', 'staff:write',
      'inbox:read', 'inbox:handle',
      'labor:read', 'labor:write',
    ],
  },
  staff: {
    permissions: [
      'schedule:read:own',  // Only own shifts
      'availability:write:own',
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
- Request time off (creates message for AI)
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

| Sprint Size | Characteristics |
|-------------|-----------------|
| Small | Single model/service + basic UI component |
| Medium | Multiple related files + moderate UI complexity |
| Large | Cross-cutting feature + multiple integrations |

**If a sprint feels too large**, split it:
1. Data layer first (model + service + action)
2. UI second (page + components)
3. Integration third (connecting pieces)

---

## Progress Tracking

| Phase | Status | Sprints | Est. Sessions |
|-------|--------|---------|---------------|
| Phase 1 | ✅ Complete | 3 | - |
| Phase 2 | ✅ Complete | 4 | - |
| Phase 3 | 🔜 Next | 10 | 15-20 |
| Phase 4 | ⏳ Planned | 8 | 12-16 |
| Phase 5 | ⏳ Planned | 7 | 10-14 |

**Total Remaining:** ~25 sprints, ~40-50 coding sessions

---

*Last Updated: January 2026*
