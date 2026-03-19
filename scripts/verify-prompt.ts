import { buildSystemPrompt } from "../src/lib/ai/orchestrator/system-prompt";

async function main() {
  const mockContext: any = {
    auth: { role: "admin" },
    allowedTools: [],
    viewport: { viewport: {} },
  };

  const prompt = buildSystemPrompt(mockContext, "America/New_York");
  console.log("=== SYSTEM PROMPT ===");
  console.log(prompt);
  console.log("=====================");

  if (prompt.includes("SCOPE AND TOPIC CONSTRAINTS")) {
    console.log("✅ Verification successful: Constraint section found.");
    process.exit(0);
  } else {
    console.error("❌ Verification failed: Constraint section not found.");
    process.exit(1);
  }
}

main().catch(console.error);
