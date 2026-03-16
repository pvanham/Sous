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

