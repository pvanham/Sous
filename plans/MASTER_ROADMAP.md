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

## Phase 3: The "Sous" Agent (AI Schedule Generation) ✅ COMPLETE

**Status**: ✅ Complete (March 2026)  
**Documentation**: See `SCHEDULE_GENERATION.md`

**Delivered:**

- Transitioned from the original LLM Soft-Selector plan to a pure Python CP-SAT Microservice.
- Next.js backend prepares the input (calculating valid candidates, labor requirements, availability, and existing shifts) and sends it to the FastApi solver.
- The constraint programming solver uses OR-Tools to hit target mathematical objective functions (optimizing labor cost, preference hits, and fairness) while strictly respecting hard constraints (max hours, clopening, etc.).
- Robust user interfaces for defining labor requirements and staff availabilities.
- "Generate Base Schedule" action that populates a preview grid of deterministic shift assignments before the manager commits to them.
- *Note: The planned AI Swap Optimizer step was deprecated and is being reimagined as an interactive AI Assistant in Phase 4.*

---

## Phase 4: Agentic AI Scheduling Assistant

**Goal:** An interactive, conversational AI agent that actively assists the manager in reviewing schedules, refining shifts, and managing team dynamics.

**Background:** The previous approach of a passive AI swap randomizer run during initial generation was deprecated due to lack of manager control and predictability. Instead, this phase will introduce a fully agentic assistant that managers can collaborate with.

### Sprint 4.1: AI Assistant Chat UI

**Scope:** A conversational sidebar or dialog in the scheduling dashboard.

**Features:** 
- Chat interface for managers to ask natural language questions (e.g., "Why is John getting so much overtime?" or "Can we swap Alice and Bob's shifts on Friday?").
- Persistent message history using the Vercel AI SDK.

### Sprint 4.2: Scheduling Context Pipeline

**Scope:** Provide the agent with full system context.

**Features:**
- Inject the current visible schedule, staff availability, and labor requirements into the LLM system prompt.
- Structure the state so the agent understands shift start/end times and station constraints.

### Sprint 4.3: Agentic Tool Calling & Mutations

**Scope:** Empower the agent to take action.

**Features:**
- Define explicit tools the agent can use (`propose_shift_swap`, `find_coverage_for_slot`, `analyze_labor_cost`).
- When the agent calls a mutation tool, it updates the visual UI (e.g., highlighting proposed shift changes in the central grid).
- Explicit manager `Accept/Reject` confirmation controls for any agent-proposed schedule mutations.

---

## Phase 5: The Reactive Hotline (LLM-Powered SMS Automation)

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

### Sprint 5.1: Twilio Integration & Message Storage

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

### Sprint 5.2: Message Processing Agent with Confidence Routing

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
  confidence: number
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

### Sprint 5.3: Background Message Processing

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

> **Context for Cursor:** "Create a message processing service that runs after webhook saves the message. Use **Inngest** for background job processing. Install inngest package. Create Inngest functions: (1) message.received - processes SMS using MessageAgentService from Sprint 5.2, (2) coverage.waterfall-step - handles 15-min timeouts for coverage requests, (3) shift.reminder - scheduled day-before reminders. Set up Inngest client with proper env vars. Create `/api/inngest` route for Inngest webhook. Update message status as it progresses through stages. If autonomous handling succeeds, send response SMS and mark as 'handled'. If it fails or is uncertain, mark as 'escalated' and send manager notification (for now, just log it). Handle errors gracefully—don't lose messages."

---

### Sprint 5.4: Manager Inbox Dashboard

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

### Sprint 5.5: Coverage Request Automation

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

### Sprint 5.6: Conversation Threading & Context

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

### Sprint 5.7: Outbound Notifications

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

> **Context for Cursor:** "Create a notification service for outbound SMS. Add a 'Notify Staff' button to the schedule page that sends each scheduled employee their shifts for the week. Messages should be formatted nicely. Track outbound messages in the Message collection with direction='outbound'. Use the Twilio client from Sprint 5.2. Respect rate limits."

---

### Sprint 5.8: Phase 5 Testing & Time Travel Tool

**Scope:** Verification, robustness, and testing utilities for time-dependent flows.

**Files to Create:**

- `scripts/test-phase-5.ts`
- `src/lib/testing/time-travel.ts` - Dev tool for testing time-dependent flows
- Update `package.json` with `test:phase-5` script

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

> **Context for Cursor:** "Create a Phase 5 verification script. Include a TimeTravel dev utility for testing time-dependent flows (waterfall timeouts, offer expiration). Test: (1) confidence routing (high/medium/low), (2) waterfall sends one SMS at a time, (3) timeout triggers next candidate, (4) conversation threading with currentIntentContext. Mock Twilio and OpenAI for deterministic tests. The TimeTravel tool should only be available in development."

---

## Phase 6: Production Preparation

**Goal:** Security, access control, mobile experience, and deployment readiness.

**Future Consideration (Post-MVP):** The Phase 5 Inbox currently uses TanStack Query polling for updates. For a truly "reactive" experience where managers see incoming texts instantly, consider adding Server-Sent Events (SSE) or a service like Pusher in a future iteration. Polling is acceptable for MVP.

---

### Sprint 6.1: Role-Based Access Control (RBAC)

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

### Sprint 6.2: Staff Self-Service Portal

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

### Sprint 6.3: Settings & Configuration Improvements

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

### Sprint 6.4: Error Boundaries & Loading States

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

### Sprint 6.5: Performance Optimization

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

### Sprint 6.6: Environment & Deployment Configuration

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

### Sprint 6.7: Final Testing & Documentation

**Scope:** End-to-end testing and documentation.

**Files to Create:**

- `scripts/test-e2e.ts` - Full integration test
- Update `README.md` - Complete documentation
- `DEPLOYMENT.md` - Deployment guide
- `plans/PHASE-6-COMPLETE.md` - Completion report

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
| Phase 3 | ✅ Complete | 12      | -             |
| Phase 4 | ⏳ Planned  | TBD     | TBD           |
| Phase 5 | ⏳ Planned  | 8       | 12-16         |
| Phase 6 | ⏳ Planned  | 7       | 10-14         |

**Total Remaining:** ~15+ sprints, ~22-30+ coding sessions

### Phase 3 Key Architecture Changes (CP Solver)

- **Sprint 3.4a/3.4b**: TimeOffRequests (date-range) + approval workflow
- **Sprint 3.5**: CandidateService (Hard Filter)
- **Sprint 3.6 - 3.X**: Python CP-SAT Solver Integration (FastAPI + OR-Tools)
- **Sprint 3.10**: Snapshotting for undo capability

### Phase 5 Key Risk Mitigations

- **Confidence Thresholds**: High=auto, Medium=draft, Low=escalate
- **Waterfall SMS**: Text one candidate at a time, not blast
- **State Management**: `threadId` + `currentIntentContext` for SMS threading
- **Time Travel Tool**: Dev utility for testing time-dependent flows

---

_Last Updated: March 2026_
