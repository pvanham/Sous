# Roadmap — SMS Automation

> Forward-looking. Not started. Nothing in `apps/web` references
> Twilio today.

## Why

Restaurant staff communicate via text, not dashboards. The highest-
value automations — "I'm calling out sick tonight", "running
30 minutes late", "can someone cover Friday dinner?" — happen on
SMS. Today the manager has to re-enter those messages into the
dashboard. SMS automation closes that loop.

## What "done" looks like

- A Twilio webhook receives inbound SMS, matches the number to a
  `Staff` record, and persists the message.
- An LLM classifies intent (call-out, late, swap, availability,
  other) with a **confidence score**, and the system routes by
  confidence:
  - **≥90% — auto-handle.** Execute the workflow (e.g. find coverage
    for a called-out shift), reply to the staff member, and log the
    action for manager review.
  - **70–89% — draft & wait.** Draft the reply and the proposed
    schedule mutation; surface both in the manager's inbox as a
    `StoredProposal` (same shape as the in-dashboard assistant uses).
  - **<70% — escalate.** Surface the raw message plus the LLM's
    analysis to the manager for a manual decision.
- Every outbound SMS passes through a consent gate (TCPA: STOP,
  START, HELP keywords respected; `smsConsent` flag on `Staff`).
- Every auto-handled mutation flows through the existing
  [propose → execute](../architecture/07-ai-orchestrator.md) funnel
  so the audit shape is identical to in-dashboard AI actions.

## Non-negotiable constraints

- **Human-in-the-loop gradient is the product.** Auto-approving a
  call-out that leaves the kitchen empty is a product-killing bug.
  Confidence thresholds exist for this reason.
- **Idempotency on the webhook.** Twilio retries. De-dupe by
  `MessageSid` before doing any work.
- **E.164 phone normalisation** on `Staff.phone` at write time, with
  a `(orgId, locationId, phone)` uniqueness index.
- **Reuse the proposal model.** Do not invent a parallel mutation
  path for SMS-originated actions.

## Open questions

- Per-org vs. shared Twilio number? Shared is cheaper; per-org
  avoids cross-tenant number collisions.
- Where does the confidence threshold live — org config, Clerk
  metadata, or a global constant? Most likely org config so owners
  can dial automation up and down.
- How does this interact with the mobile app's existing time-off
  and exchange flows? The mobile app can submit time-off directly;
  SMS should probably funnel into the same `TimeOffRequest` records
  rather than a parallel system.

## Blockers

- Audit logging (see `02-production-readiness.md`) should land
  before SMS auto-approval. A feature that silently rewrites the
  schedule must leave a trail.
- Decide billing treatment. SMS-per-message pricing, included
  quota, or pass-through to the customer's Twilio account.
