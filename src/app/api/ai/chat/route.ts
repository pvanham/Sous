import { streamText, stepCountIs, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { chatMessageSchema } from "@/lib/validations/chat-message.schema";
import { buildOrchestratorContext } from "@/lib/ai/orchestrator/build-context";
import { buildSystemPrompt } from "@/lib/ai/orchestrator/system-prompt";
import { toAISDKTools } from "@/lib/ai/tools/ai-sdk-adapter";
import { dbConnect } from "@/lib/db";
import { LocationService } from "@/server/services/location.service";
import type { ToolExecutionContext } from "@/lib/ai/tools/tool-registry.types";

export const maxDuration = 30;

const MAX_TOOL_STEPS = 5;

export async function POST(req: Request) {
  // 1. Authenticate
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  // 2. Parse and validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request: malformed JSON body." },
      { status: 400 }
    );
  }

  const parseResult = chatMessageSchema.safeParse(body);
  if (!parseResult.success) {
    const validationErrors = parseResult.error.issues
      .map((i) => {
        const path = i.path.join(".");
        return path ? `${path}: ${i.message}` : i.message;
      })
      .join(", ");
    return NextResponse.json(
      { error: `Invalid request: ${validationErrors}` },
      { status: 400 }
    );
  }

  const { message, conversationId, viewportContext } = parseResult.data;

  // 3. Connect to database
  await dbConnect();

  // 4. Build orchestrator context (auth, RBAC, viewport verification)
  let orchestratorContext: Awaited<
    ReturnType<typeof buildOrchestratorContext>
  >;
  try {
    orchestratorContext = await buildOrchestratorContext({
      clerkUserId: userId,
      rawViewportContext: viewportContext,
      userMessage: message,
    });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);

    if (
      errMessage.toLowerCase().includes("access") ||
      errMessage.toLowerCase().includes("permission") ||
      errMessage.toLowerCase().includes("denied")
    ) {
      return NextResponse.json(
        { error: `Access denied: ${errMessage}` },
        { status: 403 }
      );
    }

    console.error("[ai/chat] Failed to build orchestrator context:", errMessage);
    return NextResponse.json(
      { error: "An internal error occurred. Please try again." },
      { status: 500 }
    );
  }

  // 5. Resolve the location timezone for temporal context in the system prompt
  const location = await LocationService.getById(
    orchestratorContext.auth.locationId
  );
  const locationTimezone = location?.timezone ?? "UTC";

  // 6. Build tools and system prompt
  const toolExecutionContext: ToolExecutionContext = {
    orgId: orchestratorContext.auth.orgId,
    locationId: orchestratorContext.auth.locationId,
    clerkUserId: orchestratorContext.auth.clerkUserId,
    role: orchestratorContext.auth.role,
    conversationId,
  };

  const tools = toAISDKTools(
    orchestratorContext.allowedTools,
    toolExecutionContext
  );

  const systemPrompt = buildSystemPrompt(orchestratorContext, locationTimezone);

  // 7. Stream the LLM response
  const messages: ModelMessage[] = [{ role: "user", content: message }];

  const result = streamText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    messages,
    tools,
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
    onError({ error }) {
      console.error("[ai/chat] streamText error:", error);
    },
  });

  // 8. Return the streaming response
  return result.toUIMessageStreamResponse();
}
