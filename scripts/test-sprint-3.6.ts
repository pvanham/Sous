/**
 * Sprint 3.6 End-to-End Verification Script
 *
 * Self-contained: seeds test data, runs all tests, cleans up.
 *
 * Verifies:
 *   1. AIUsageLog model -- create, query, DTO conversion
 *   2. AIUsageService.logUsage -- verify DTO conversion
 *   3. AIUsageService.getMonthlyUsage -- verify aggregation logic
 *   4. AIUsageService.canGenerate -- limit enforcement (under, at, over)
 *   5. AIUsageService.getUsageHistory -- date range filtering
 *   6. KitchenConfig aiSettings -- upsert with new field, defaults
 *   7. OpenAI client -- generateCompletion and generateJSON (requires OPENAI_API_KEY)
 *   8. OpenAI client -- AILimitExceededError when limit exceeded
 *
 * Run: npm run test:sprint-3.6
 *
 * Required Environment Variables:
 *   - MONGODB_URI: MongoDB connection string (from .env.local)
 *   - OPENAI_API_KEY: OpenAI API key (optional - OpenAI tests skipped if not set)
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { dbConnect } from "../src/lib/db";
import mongoose, { Types } from "mongoose";

// Model imports (only in test scripts, not in app code)
import AIUsageLog from "../src/server/models/AIUsageLog";
import KitchenConfig from "../src/server/models/KitchenConfig";

// Service imports
import { AIUsageService } from "../src/server/services/ai-usage.service";
import { KitchenConfigService } from "../src/server/services/kitchen-config.service";

// Type imports
import { toAIUsageLogDTO } from "../src/types/ai-usage";
import type { TokenUsage } from "../src/types/ai-usage";

// ============================================================================
// Test Constants
// ============================================================================

const TEST_ORG_ID = new Types.ObjectId().toString();
const TEST_LOCATION_ID = new Types.ObjectId().toString();
const TEST_CLERK_USER_ID = "user_test_sprint_3_6";

// ============================================================================
// Test Infrastructure
// ============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let skippedTests = 0;
const errors: string[] = [];

function log(message: string): void {
  console.log(`  ${message}`);
}

function logStep(step: string): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${step}`);
  console.log(`${"─".repeat(60)}`);
}

function assert(condition: boolean, testName: string, detail?: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${testName}`);
  } else {
    failedTests++;
    const msg = detail ? `${testName} -- ${detail}` : testName;
    console.log(`  ✗ FAIL: ${msg}`);
    errors.push(msg);
  }
}

function assertCount(actual: number, expected: number, label: string): void {
  assert(
    actual === expected,
    `${label}: ${actual} (expected ${expected})`,
    `got ${actual}, expected ${expected}`
  );
}

function skip(testName: string, reason: string): void {
  totalTests++;
  skippedTests++;
  console.log(`  ⊘ SKIP: ${testName} -- ${reason}`);
}

// ============================================================================
// Cleanup
// ============================================================================

async function cleanup(): Promise<void> {
  log("Cleaning up test data...");

  await AIUsageLog.deleteMany({
    orgId: new Types.ObjectId(TEST_ORG_ID),
    locationId: new Types.ObjectId(TEST_LOCATION_ID),
  });

  await KitchenConfig.deleteMany({
    orgId: new Types.ObjectId(TEST_ORG_ID),
    locationId: new Types.ObjectId(TEST_LOCATION_ID),
  });

  log("Cleanup complete.");
}

// ============================================================================
// Test 1: AIUsageLog Model CRUD & DTO Conversion
// ============================================================================

async function testAIUsageLogModel(): Promise<void> {
  logStep("Test 1: AIUsageLog Model CRUD & DTO Conversion");

  // Create a usage log entry directly via model
  const doc = await AIUsageLog.create({
    orgId: new Types.ObjectId(TEST_ORG_ID),
    locationId: new Types.ObjectId(TEST_LOCATION_ID),
    clerkUserId: TEST_CLERK_USER_ID,
    action: "schedule_generation",
    modelName: "gpt-4o",
    promptTokens: 1500,
    completionTokens: 800,
    totalTokens: 2300,
    estimatedCostCents: 1.18,
    durationMs: 3400,
    success: true,
  });

  assert(doc._id !== undefined, "AIUsageLog document created with _id");
  assert(doc.action === "schedule_generation", "Action stored correctly");
  assert(doc.promptTokens === 1500, "Prompt tokens stored correctly");
  assert(doc.completionTokens === 800, "Completion tokens stored correctly");
  assert(doc.totalTokens === 2300, "Total tokens stored correctly");
  assert(doc.success === true, "Success flag stored correctly");
  assert(doc.createdAt instanceof Date, "createdAt is a Date");

  // Test DTO conversion
  const dto = toAIUsageLogDTO(doc);
  assert(typeof dto.id === "string", "DTO id is a string");
  assert(dto.orgId === TEST_ORG_ID, "DTO orgId converted to string");
  assert(dto.locationId === TEST_LOCATION_ID, "DTO locationId converted to string");
  assert(dto.clerkUserId === TEST_CLERK_USER_ID, "DTO clerkUserId preserved");
  assert(dto.action === "schedule_generation", "DTO action preserved");
  assert(dto.promptTokens === 1500, "DTO promptTokens preserved");
  assert(dto.estimatedCostCents === 1.18, "DTO estimatedCostCents preserved");

  // Test querying
  const found = await AIUsageLog.findById(doc._id).lean();
  assert(found !== null, "AIUsageLog found by ID");

  // Test failed entry
  const failedDoc = await AIUsageLog.create({
    orgId: new Types.ObjectId(TEST_ORG_ID),
    locationId: new Types.ObjectId(TEST_LOCATION_ID),
    clerkUserId: TEST_CLERK_USER_ID,
    action: "message_parsing",
    modelName: "gpt-4o",
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostCents: 0,
    durationMs: 150,
    success: false,
    error: "API rate limited",
  });

  assert(failedDoc.success === false, "Failed entry stored with success=false");
  assert(failedDoc.error === "API rate limited", "Error message stored");

  const failedDto = toAIUsageLogDTO(failedDoc);
  assert(failedDto.error === "API rate limited", "DTO error field preserved");
}

// ============================================================================
// Test 2: AIUsageService.logUsage
// ============================================================================

async function testLogUsage(): Promise<void> {
  logStep("Test 2: AIUsageService.logUsage");

  const usage: TokenUsage = {
    promptTokens: 2000,
    completionTokens: 1000,
    totalTokens: 3000,
    estimatedCostCents: 1.5,
  };

  const dto = await AIUsageService.logUsage(
    TEST_ORG_ID,
    TEST_LOCATION_ID,
    TEST_CLERK_USER_ID,
    "schedule_generation",
    usage,
    {
      modelName: "gpt-4o",
      durationMs: 2500,
      success: true,
    }
  );

  assert(typeof dto.id === "string", "logUsage returns DTO with string id");
  assert(dto.orgId === TEST_ORG_ID, "logUsage DTO has correct orgId");
  assert(dto.locationId === TEST_LOCATION_ID, "logUsage DTO has correct locationId");
  assert(dto.action === "schedule_generation", "logUsage DTO has correct action");
  assert(dto.promptTokens === 2000, "logUsage DTO has correct promptTokens");
  assert(dto.completionTokens === 1000, "logUsage DTO has correct completionTokens");
  assert(dto.totalTokens === 3000, "logUsage DTO has correct totalTokens");
  assert(dto.estimatedCostCents === 1.5, "logUsage DTO has correct cost");
  assert(dto.durationMs === 2500, "logUsage DTO has correct durationMs");
  assert(dto.success === true, "logUsage DTO has correct success flag");

  // Log a failed usage entry
  const failedDto = await AIUsageService.logUsage(
    TEST_ORG_ID,
    TEST_LOCATION_ID,
    TEST_CLERK_USER_ID,
    "schedule_refinement",
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostCents: 0 },
    {
      modelName: "gpt-4o",
      durationMs: 100,
      success: false,
      error: "Connection timeout",
    }
  );

  assert(failedDto.success === false, "Failed logUsage returns success=false");
  assert(failedDto.error === "Connection timeout", "Failed logUsage preserves error");
}

// ============================================================================
// Test 3: AIUsageService.getMonthlyUsage
// ============================================================================

async function testGetMonthlyUsage(): Promise<void> {
  logStep("Test 3: AIUsageService.getMonthlyUsage");

  // First, ensure we have a KitchenConfig with aiSettings for this location
  await KitchenConfigService.upsert(TEST_ORG_ID, TEST_LOCATION_ID, {
    name: "Test Kitchen 3.6",
    stations: ["Grill", "Prep"],
    roles: ["Cook"],
    operatingHours: {
      monday: { isOpen: true, open: "09:00", close: "22:00" },
      tuesday: { isOpen: true, open: "09:00", close: "22:00" },
      wednesday: { isOpen: true, open: "09:00", close: "22:00" },
      thursday: { isOpen: true, open: "09:00", close: "22:00" },
      friday: { isOpen: true, open: "09:00", close: "22:00" },
      saturday: { isOpen: true, open: "09:00", close: "22:00" },
      sunday: { isOpen: false, open: "09:00", close: "22:00" },
    },
    minTimeOffAdvanceDays: 7,
    aiSettings: {
      monthlyGenerationLimit: 10,
      subscriptionTier: "free",
    },
  });

  const summary = await AIUsageService.getMonthlyUsage(
    TEST_ORG_ID,
    TEST_LOCATION_ID
  );

  // From Test 1 we have 1 schedule_generation + 1 message_parsing
  // From Test 2 we have 1 schedule_generation + 1 schedule_refinement
  // Total schedule_generation count = 2
  assert(summary.generationCount >= 2, `Generation count >= 2 (got ${summary.generationCount})`);
  assert(summary.totalTokens > 0, `Total tokens > 0 (got ${summary.totalTokens})`);
  assert(summary.totalCostCents >= 0, `Total cost >= 0 (got ${summary.totalCostCents})`);
  assert(summary.limit === 10, `Limit matches KitchenConfig (got ${summary.limit}, expected 10)`);
  assert(
    summary.remaining === summary.limit - summary.generationCount,
    `Remaining = limit - count (got ${summary.remaining}, expected ${summary.limit - summary.generationCount})`
  );

  log(`  Summary: ${summary.generationCount} generations, ${summary.totalTokens} tokens, ${summary.totalCostCents}¢`);
}

// ============================================================================
// Test 4: AIUsageService.canGenerate (Limit Enforcement)
// ============================================================================

async function testCanGenerate(): Promise<void> {
  logStep("Test 4: AIUsageService.canGenerate (Limit Enforcement)");

  // Current state: 2 generations out of limit 10 -> should be allowed
  const check1 = await AIUsageService.canGenerate(TEST_ORG_ID, TEST_LOCATION_ID);
  assert(check1.allowed === true, "Under limit: allowed=true");
  assert(check1.remaining > 0, `Under limit: remaining=${check1.remaining} > 0`);

  // Now reduce the limit to exactly match current count
  const summary = await AIUsageService.getMonthlyUsage(TEST_ORG_ID, TEST_LOCATION_ID);
  const currentCount = summary.generationCount;

  // Set limit to current count (should still allow because remaining = 0 means NOT allowed)
  await KitchenConfigService.upsert(TEST_ORG_ID, TEST_LOCATION_ID, {
    name: "Test Kitchen 3.6",
    stations: ["Grill", "Prep"],
    roles: ["Cook"],
    operatingHours: {
      monday: { isOpen: true, open: "09:00", close: "22:00" },
      tuesday: { isOpen: true, open: "09:00", close: "22:00" },
      wednesday: { isOpen: true, open: "09:00", close: "22:00" },
      thursday: { isOpen: true, open: "09:00", close: "22:00" },
      friday: { isOpen: true, open: "09:00", close: "22:00" },
      saturday: { isOpen: true, open: "09:00", close: "22:00" },
      sunday: { isOpen: false, open: "09:00", close: "22:00" },
    },
    minTimeOffAdvanceDays: 7,
    aiSettings: {
      monthlyGenerationLimit: currentCount,
      subscriptionTier: "free",
    },
  });

  const check2 = await AIUsageService.canGenerate(TEST_ORG_ID, TEST_LOCATION_ID);
  assert(check2.allowed === false, `At limit (${currentCount}/${currentCount}): allowed=false`);
  assertCount(check2.remaining, 0, "At limit: remaining");

  // Set limit to 1 less than count (over limit)
  await KitchenConfigService.upsert(TEST_ORG_ID, TEST_LOCATION_ID, {
    name: "Test Kitchen 3.6",
    stations: ["Grill", "Prep"],
    roles: ["Cook"],
    operatingHours: {
      monday: { isOpen: true, open: "09:00", close: "22:00" },
      tuesday: { isOpen: true, open: "09:00", close: "22:00" },
      wednesday: { isOpen: true, open: "09:00", close: "22:00" },
      thursday: { isOpen: true, open: "09:00", close: "22:00" },
      friday: { isOpen: true, open: "09:00", close: "22:00" },
      saturday: { isOpen: true, open: "09:00", close: "22:00" },
      sunday: { isOpen: false, open: "09:00", close: "22:00" },
    },
    minTimeOffAdvanceDays: 7,
    aiSettings: {
      monthlyGenerationLimit: Math.max(1, currentCount - 1),
      subscriptionTier: "free",
    },
  });

  const check3 = await AIUsageService.canGenerate(TEST_ORG_ID, TEST_LOCATION_ID);
  assert(check3.allowed === false, `Over limit: allowed=false`);
  assertCount(check3.remaining, 0, "Over limit: remaining");

  // Reset limit to 50 for later tests
  await KitchenConfigService.upsert(TEST_ORG_ID, TEST_LOCATION_ID, {
    name: "Test Kitchen 3.6",
    stations: ["Grill", "Prep"],
    roles: ["Cook"],
    operatingHours: {
      monday: { isOpen: true, open: "09:00", close: "22:00" },
      tuesday: { isOpen: true, open: "09:00", close: "22:00" },
      wednesday: { isOpen: true, open: "09:00", close: "22:00" },
      thursday: { isOpen: true, open: "09:00", close: "22:00" },
      friday: { isOpen: true, open: "09:00", close: "22:00" },
      saturday: { isOpen: true, open: "09:00", close: "22:00" },
      sunday: { isOpen: false, open: "09:00", close: "22:00" },
    },
    minTimeOffAdvanceDays: 7,
    aiSettings: {
      monthlyGenerationLimit: 50,
      subscriptionTier: "free",
    },
  });
}

// ============================================================================
// Test 5: AIUsageService.getUsageHistory
// ============================================================================

async function testGetUsageHistory(): Promise<void> {
  logStep("Test 5: AIUsageService.getUsageHistory");

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const history = await AIUsageService.getUsageHistory(
    TEST_ORG_ID,
    TEST_LOCATION_ID,
    startOfMonth,
    endOfMonth
  );

  assert(Array.isArray(history), "History returns an array");
  assert(history.length >= 4, `History has >= 4 entries (got ${history.length})`);

  // Verify DTOs are properly formatted
  const first = history[0];
  assert(typeof first.id === "string", "History DTO has string id");
  assert(typeof first.orgId === "string", "History DTO has string orgId");
  assert(first.createdAt instanceof Date, "History DTO has Date createdAt");

  // Verify reverse chronological order
  if (history.length >= 2) {
    const isOrdered = history[0].createdAt.getTime() >= history[1].createdAt.getTime();
    assert(isOrdered, "History is in reverse chronological order");
  }

  // Test with a date range that should return nothing
  const futureStart = new Date(now.getFullYear() + 1, 0, 1);
  const futureEnd = new Date(now.getFullYear() + 1, 0, 31);
  const emptyHistory = await AIUsageService.getUsageHistory(
    TEST_ORG_ID,
    TEST_LOCATION_ID,
    futureStart,
    futureEnd
  );
  assertCount(emptyHistory.length, 0, "Future date range returns empty");
}

// ============================================================================
// Test 6: KitchenConfig aiSettings
// ============================================================================

async function testKitchenConfigAISettings(): Promise<void> {
  logStep("Test 6: KitchenConfig aiSettings");

  // Read the config created in test 3
  const config = await KitchenConfigService.getByLocation(
    TEST_ORG_ID,
    TEST_LOCATION_ID
  );

  assert(config !== null, "KitchenConfig exists for test location");
  if (!config) return;

  assert(config.aiSettings !== undefined, "aiSettings field exists on DTO");
  assert(
    config.aiSettings.monthlyGenerationLimit === 50,
    `monthlyGenerationLimit = 50 (got ${config.aiSettings.monthlyGenerationLimit})`
  );
  assert(
    config.aiSettings.subscriptionTier === "free",
    `subscriptionTier = 'free' (got ${config.aiSettings.subscriptionTier})`
  );

  // Update aiSettings
  const updated = await KitchenConfigService.upsert(
    TEST_ORG_ID,
    TEST_LOCATION_ID,
    {
      name: "Test Kitchen 3.6 Updated",
      stations: ["Grill", "Prep", "Sauté"],
      roles: ["Cook", "Sous Chef"],
      operatingHours: {
        monday: { isOpen: true, open: "09:00", close: "22:00" },
        tuesday: { isOpen: true, open: "09:00", close: "22:00" },
        wednesday: { isOpen: true, open: "09:00", close: "22:00" },
        thursday: { isOpen: true, open: "09:00", close: "22:00" },
        friday: { isOpen: true, open: "09:00", close: "22:00" },
        saturday: { isOpen: true, open: "09:00", close: "22:00" },
        sunday: { isOpen: false, open: "09:00", close: "22:00" },
      },
      minTimeOffAdvanceDays: 7,
      aiSettings: {
        monthlyGenerationLimit: 100,
        subscriptionTier: "pro",
      },
    }
  );

  assert(
    updated.aiSettings.monthlyGenerationLimit === 100,
    `Updated limit = 100 (got ${updated.aiSettings.monthlyGenerationLimit})`
  );
  assert(
    updated.aiSettings.subscriptionTier === "pro",
    `Updated tier = 'pro' (got ${updated.aiSettings.subscriptionTier})`
  );

  // Test upsert WITHOUT aiSettings (should preserve defaults)
  const withoutAI = await KitchenConfigService.upsert(
    TEST_ORG_ID,
    TEST_LOCATION_ID,
    {
      name: "Test Kitchen 3.6 No AI",
      stations: ["Grill"],
      roles: ["Cook"],
      operatingHours: {
        monday: { isOpen: true, open: "09:00", close: "22:00" },
        tuesday: { isOpen: true, open: "09:00", close: "22:00" },
        wednesday: { isOpen: true, open: "09:00", close: "22:00" },
        thursday: { isOpen: true, open: "09:00", close: "22:00" },
        friday: { isOpen: true, open: "09:00", close: "22:00" },
        saturday: { isOpen: true, open: "09:00", close: "22:00" },
        sunday: { isOpen: false, open: "09:00", close: "22:00" },
      },
      minTimeOffAdvanceDays: 7,
    }
  );

  assert(
    withoutAI.aiSettings !== undefined,
    "aiSettings exists even when not provided in upsert"
  );
  // When not provided, the existing values should persist (Mongoose doesn't overwrite with defaults on update)
  assert(
    withoutAI.aiSettings.monthlyGenerationLimit > 0,
    `aiSettings.monthlyGenerationLimit > 0 (got ${withoutAI.aiSettings.monthlyGenerationLimit})`
  );
}

// ============================================================================
// Test 7: OpenAI Client (requires OPENAI_API_KEY)
// ============================================================================

async function testOpenAIClient(): Promise<void> {
  logStep("Test 7: OpenAI Client (generateCompletion & generateJSON)");

  if (!process.env.OPENAI_API_KEY) {
    skip("generateCompletion", "OPENAI_API_KEY not set");
    skip("generateJSON", "OPENAI_API_KEY not set");
    skip("Token usage returned", "OPENAI_API_KEY not set");
    skip("Usage tracking logged", "OPENAI_API_KEY not set");
    return;
  }

  // Dynamic import to avoid errors when key is missing
  const { generateCompletion, generateJSON } = await import(
    "../src/lib/ai/openai-client"
  );

  // Test generateCompletion
  log("  Testing generateCompletion...");
  const completionResult = await generateCompletion(
    "You are a helpful assistant. Respond in one short sentence.",
    "What is 2 + 2?",
    {
      model: "gpt-4o-mini",
      maxTokens: 50,
      tracking: {
        orgId: TEST_ORG_ID,
        locationId: TEST_LOCATION_ID,
        clerkUserId: TEST_CLERK_USER_ID,
        action: "message_parsing",
      },
    }
  );

  assert(
    typeof completionResult.content === "string" && completionResult.content.length > 0,
    `generateCompletion returns content (${completionResult.content.length} chars)`
  );
  assert(
    completionResult.usage.totalTokens > 0,
    `generateCompletion returns token usage (${completionResult.usage.totalTokens} tokens)`
  );
  assert(
    completionResult.usage.estimatedCostCents >= 0,
    `generateCompletion returns cost estimate (${completionResult.usage.estimatedCostCents}¢)`
  );

  // Test generateJSON
  log("  Testing generateJSON...");
  interface TestJSONResponse {
    answer: number;
    explanation: string;
  }

  const jsonResult = await generateJSON<TestJSONResponse>(
    "You are a math assistant. Always respond in JSON format with keys: answer (number) and explanation (string).",
    "What is 7 * 8?",
    {
      model: "gpt-4o-mini",
      maxTokens: 100,
      tracking: {
        orgId: TEST_ORG_ID,
        locationId: TEST_LOCATION_ID,
        clerkUserId: TEST_CLERK_USER_ID,
        action: "message_parsing",
      },
    }
  );

  assert(
    typeof jsonResult.data.answer === "number",
    `generateJSON returns parsed data with answer (${jsonResult.data.answer})`
  );
  assert(
    typeof jsonResult.data.explanation === "string",
    `generateJSON returns parsed data with explanation`
  );
  assert(
    jsonResult.usage.totalTokens > 0,
    `generateJSON returns token usage (${jsonResult.usage.totalTokens} tokens)`
  );

  // Verify usage was logged via tracking
  const recentHistory = await AIUsageService.getUsageHistory(
    TEST_ORG_ID,
    TEST_LOCATION_ID,
    new Date(Date.now() - 60_000), // Last 60 seconds
    new Date()
  );
  const messageParsings = recentHistory.filter(
    (h) => h.action === "message_parsing" && h.success
  );
  assert(
    messageParsings.length >= 2,
    `Usage tracking logged OpenAI calls (${messageParsings.length} message_parsing entries)`
  );
}

// ============================================================================
// Test 8: OpenAI Client -- AILimitExceededError
// ============================================================================

async function testLimitExceeded(): Promise<void> {
  logStep("Test 8: AILimitExceededError on generateCompletion");

  if (!process.env.OPENAI_API_KEY) {
    skip("AILimitExceededError", "OPENAI_API_KEY not set");
    return;
  }

  const { generateCompletion, AILimitExceededError } = await import(
    "../src/lib/ai/openai-client"
  );

  // Set limit to 1 (we already have several generations logged)
  await KitchenConfigService.upsert(TEST_ORG_ID, TEST_LOCATION_ID, {
    name: "Test Kitchen 3.6 Limit",
    stations: ["Grill"],
    roles: ["Cook"],
    operatingHours: {
      monday: { isOpen: true, open: "09:00", close: "22:00" },
      tuesday: { isOpen: true, open: "09:00", close: "22:00" },
      wednesday: { isOpen: true, open: "09:00", close: "22:00" },
      thursday: { isOpen: true, open: "09:00", close: "22:00" },
      friday: { isOpen: true, open: "09:00", close: "22:00" },
      saturday: { isOpen: true, open: "09:00", close: "22:00" },
      sunday: { isOpen: false, open: "09:00", close: "22:00" },
    },
    minTimeOffAdvanceDays: 7,
    aiSettings: {
      monthlyGenerationLimit: 1,
      subscriptionTier: "free",
    },
  });

  try {
    await generateCompletion(
      "You are a test assistant.",
      "Hello",
      {
        model: "gpt-4o-mini",
        maxTokens: 10,
        tracking: {
          orgId: TEST_ORG_ID,
          locationId: TEST_LOCATION_ID,
          clerkUserId: TEST_CLERK_USER_ID,
          action: "schedule_generation",
        },
      }
    );
    assert(false, "Should have thrown AILimitExceededError");
  } catch (error) {
    assert(
      error instanceof AILimitExceededError,
      `Throws AILimitExceededError (got ${error instanceof Error ? error.constructor.name : typeof error})`
    );
    if (error instanceof AILimitExceededError) {
      assert(
        error.remaining === 0,
        `AILimitExceededError.remaining = 0 (got ${error.remaining})`
      );
    }
  }
}

// ============================================================================
// Main Runner
// ============================================================================

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("  SPRINT 3.6 END-TO-END VERIFICATION");
  console.log("  OpenAI Client & AI Cost Tracking");
  console.log("═".repeat(60));

  if (!process.env.OPENAI_API_KEY) {
    console.log("\n  ⚠ OPENAI_API_KEY not set -- OpenAI tests will be skipped");
    console.log("  Set it in .env.local to run full test suite\n");
  }

  await dbConnect();
  await cleanup();

  try {
    await testAIUsageLogModel();
    await testLogUsage();
    await testGetMonthlyUsage();
    await testCanGenerate();
    await testGetUsageHistory();
    await testKitchenConfigAISettings();
    await testOpenAIClient();
    await testLimitExceeded();
  } catch (error) {
    console.error("\n  ✗ UNEXPECTED ERROR:", error);
    failedTests++;
    errors.push(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }

  // Final Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log("  RESULTS");
  console.log(`${"═".repeat(60)}`);
  console.log(`  Total:   ${totalTests}`);
  console.log(`  Passed:  ${passedTests}`);
  console.log(`  Failed:  ${failedTests}`);
  console.log(`  Skipped: ${skippedTests}`);

  if (errors.length > 0) {
    console.log(`\n  FAILURES:`);
    errors.forEach((e) => console.log(`    • ${e}`));
  }

  if (failedTests > 0) {
    console.log(`\n  ✗ ${failedTests} test(s) FAILED`);
    process.exit(1);
  } else {
    console.log(`\n  ✓ All tests passed!`);
  }
}

main();
