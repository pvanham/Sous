# API Routes and Testing

This document outlines the strict rules regarding `src/app/api/...` routes and our end-to-end verification strategy.

## 1. Webhook-Only API Routes

API routes (`src/app/api/...`) are **strictly reserved for external webhooks** (e.g., Clerk, Twilio).

- All internal client-to-server communication MUST use Server Actions.
- **Reason**: Server Actions provide end-to-end type safety without defining separate API contracts. They allow us to share Zod schemas directly with the `useQuery` / `useMutation` hooks without intermediary typing layers.

### Standard Webhook Pattern

```typescript
// src/app/api/webhooks/example/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature");

    // 1. Verify webhook signature
    const isValid = verifySignature(rawBody, signature, process.env.WEBHOOK_SECRET);
    if (!isValid) {
      return new NextResponse("Invalid signature", { status: 401 });
    }

    // 2. Parse payload
    const payload = JSON.parse(rawBody);

    // 3. Process (usually passing to a service)
    await WebhookService.process(payload);

    // 4. Return success quickly (prevent timeouts)
    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Don't leak internals
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
```

## 2. End-to-End Testing Strategy

Because Sous relies heavily on database state and complex integrations (like the Python CP-Solver), we prioritize end-to-end (E2E) integration tests over pure unit tests.

These tests are executed via script files located in the `scripts/` directory.

### Current Test Suites:
- `npm run test:phase-1` — Tests Organization creation, Location creation, KitchenConfig limits, Staff CRUD operations, and CSV imports.
- `npm run test:phase-2` — Tests Schedule CRUD, Shift assignment, and overlap/clopening detection logic.
- `npm run test:phase-3` — Tests AI Schedule Generation (fetching candidates, calling the python server, parsing the response, saving shifts).
- *(Phase 4 testing will cover SMS handling and Agentic Actions)*

### Test Script Pattern

```typescript
// scripts/test-phase-X.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { dbConnect } from "../src/lib/db";
import mongoose from "mongoose";

const TEST_USER_ID = "user_test_phase_X";

async function cleanup() {
  // Delete test data linked to TEST_USER_ID
}

async function testFeature1() {
  // Test implementation
}

async function main() {
  console.log("PHASE X VERIFICATION");
  
  await dbConnect();
  await cleanup();
  
  try {
    await testFeature1();
    console.log("✓ All tests passed");
  } catch (error) {
    console.error("✗ Failed:", error);
    process.exit(1);
  } finally {
    // Clean database before exiting
    await cleanup();
    await mongoose.disconnect();
  }
}

main();
```
