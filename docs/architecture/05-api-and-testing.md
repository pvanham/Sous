# 05 — API Routes & Testing

> What the Next.js route handlers under `apps/web/src/app/api/` are for,
> how to add one, and how we test the web app end-to-end.

The **default** client-to-server path in the web app is a Server Action
(see [02-layer-patterns.md](./02-layer-patterns.md)). Route handlers
exist only for a narrow set of scenarios that Server Actions can't
express.

---

## 1. When to use a Route Handler

Use `app/api/.../route.ts` **only** for:

1. **External webhooks** that cannot post to a Server Action —
   signature-verified endpoints consumed by third parties.
   - `/api/webhooks/clerk` — user lifecycle (create, delete, session).
   - `/api/webhooks/stripe` — subscription and invoice events.
   - `/api/webhooks/twilio` — inbound SMS (not yet implemented; reserved
     for Phase 5).
2. **Streaming responses** — the Vercel AI SDK `streamText` response
   cannot be returned from a Server Action.
   - `/api/ai/chat` — the agentic chat endpoint.
3. **Billing redirects** that need to return a third-party URL for a
   client redirect.
   - `/api/billing/create-checkout` — Stripe Checkout Session.
   - `/api/billing/create-portal` — Stripe Billing Portal Session.
4. **Client-polled status endpoints** whose semantics don't map to an
   optimistic TanStack Query mutation.
   - `/api/ai/tasks/[taskId]/status` — long-running `AsyncTask` polling.
   - `/api/ai/proposals/[proposalId]/resolve` — confirm/decline a stored
     proposal.
   - `/api/ai/conversations`, `/api/ai/conversations/[conversationId]`
     — conversation history.
5. **The mobile app's public API** — endpoints consumed by the Expo
   app. Today this is just `/api/me/membership`, but the shape is
   stable and is considered part of the cross-app contract.

**Rule of thumb:** if you're tempted to add a `POST /api/users` for
"simplicity", stop. Use a Server Action. Route handlers exist for the
five categories above; adding one outside them is an architecture bug.

---

## 2. Webhook pattern

```ts
// apps/web/src/app/api/webhooks/<provider>/route.ts
import { NextResponse } from "next/server";
import { verifySignature } from "@/lib/webhooks/<provider>";
import { <Provider>Service } from "@/server/services/<provider>.service";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature");

    // 1. Verify signature (throws on mismatch)
    verifySignature(rawBody, signature, process.env.<PROVIDER>_WEBHOOK_SECRET);

    // 2. Parse payload
    const payload = JSON.parse(rawBody);

    // 3. Delegate to a service — no business logic in the handler
    await <Provider>Service.handleEvent(payload);

    // 4. Acknowledge quickly to prevent retries
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`[webhook:${req.url}] error:`, error);
    // Webhook providers usually retry on non-2xx — decide carefully
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
```

**Rules:**

- Verify the signature **before** parsing JSON.
- Add the route to the `isPublicRoute` matcher in
  `apps/web/src/proxy.ts` so the Clerk middleware doesn't gate it.
- Never leak internal state into the error response — third parties
  will see it.

### Clerk webhook specifics

`/api/webhooks/clerk` provisions `OrganizationMember` rows on
`user.created` and cascades deletions on `user.deleted`. See
`apps/web/src/app/api/webhooks/clerk/route.ts` for the canonical
implementation. Self-healing logic (creating a missing member row for a
pre-existing Clerk user) is handled by
`OrganizationMemberService.ensureMembershipForUser`.

### Stripe webhook specifics

`/api/webhooks/stripe` updates `Organization.subscriptionTier`,
`stripeSubscriptionId`, `currentPeriodEnd`, and `cancelAtPeriodEnd`
based on the incoming event. Use the shared Stripe SDK at
`apps/web/src/lib/stripe.ts` (never `new Stripe()` inline).

---

## 3. Streaming / polling endpoints

`/api/ai/chat/route.ts` is the reference implementation for a streaming
handler (`streamText` → `toUIMessageStreamResponse()`). It is documented
in full in [07-ai-orchestrator.md](./07-ai-orchestrator.md).

The polling endpoints (`/api/ai/tasks/[taskId]/status`,
`/api/ai/proposals/[proposalId]/resolve`) return JSON and enforce
`auth()` + `getLocationContext()` at the top, then delegate to a
service. They are the one exception to the "reads go through a Server
Action" guidance because the client is a `setInterval` poll that
benefits from browser caching semantics.

---

## 4. Testing strategy

### 4.1 Integration test scripts (`scripts/test-*.ts`)

Historically the web app's E2E story is a set of long-running Node
scripts under `scripts/` that:

- Connect to a disposable Mongo cluster.
- Seed `Organization`, `Location`, `Staff`, etc.
- Run a sequence of Server Actions / Service calls.
- Clean up.

They are invoked from `apps/web` via `npm run test:phase-*`. They are
slow, coupled to Mongo, and pre-date the modular
`apps/web/packages/*` layout. They remain useful as a smoke test but
are **not** where new coverage should land.

### 4.2 Service-level tests (preferred)

For new features, write unit-style service tests that:

- Import the service directly.
- Mount Mongoose against `mongodb-memory-server` (or a clearly
  disposable cluster).
- Exercise happy path + business-rule failures.
- Do not require Clerk, Stripe, or OpenAI.

These live alongside the service (e.g.
`apps/web/src/server/services/__tests__/<feature>.service.test.ts`).

### 4.3 Action-level tests (with stubs)

Action tests stub `@clerk/nextjs/server` `auth()` and the service
imports, then assert the `ActionResponse<T>` shape and the service
call arguments. They're fast and catch Zod regressions without
requiring Mongo.

### 4.4 Mobile-app testing (future)

The Expo app currently has no automated tests. When we add them,
prefer Detox/Maestro for full-stack flows hitting a real web backend
over unit tests for features/*/api.ts (which are mostly HTTP glue).

---

## 5. Middleware & route protection

Clerk middleware lives at `apps/web/src/proxy.ts` (Next.js 16 renamed
`middleware.ts` → `proxy.ts`). It:

- Protects all routes by default via `auth.protect()`.
- Allow-lists public routes (marketing, sign-in/up, webhooks) via
  `createRouteMatcher`.
- Runs on the **Node.js** runtime (Edge is no longer supported for
  `proxy.ts`).

Adding a new public route (new webhook, new marketing page) requires
updating the matcher. Forgetting to do so manifests as an unexpected
redirect to `/sign-in`.

---

## 6. Error responses — consistent shape

All route handlers return one of:

- `NextResponse.json({ ok: true /* … */ })` on success, 2xx.
- `NextResponse.json({ error: "<message>" }, { status })` on failure.
  Use `400` for client errors, `401/403` for auth, `500` for
  unexpected. Never `200` with an error body — the mobile app uses
  HTTP status to route AuthGate decisions.

---

## 7. Files to know

- `apps/web/src/proxy.ts` — Clerk middleware (proxy).
- `apps/web/src/app/api/webhooks/clerk/route.ts`
- `apps/web/src/app/api/webhooks/stripe/route.ts`
- `apps/web/src/app/api/ai/chat/route.ts`
- `apps/web/src/app/api/ai/proposals/[proposalId]/resolve/route.ts`
- `apps/web/src/app/api/ai/tasks/[taskId]/status/route.ts`
- `apps/web/src/app/api/billing/create-checkout/route.ts`
- `apps/web/src/app/api/billing/create-portal/route.ts`
- `apps/web/src/app/api/me/membership/route.ts` — **mobile contract**
