import type { AIToolDefinition, ToolExecutionContext } from "./tool-registry.types";
import type { ToolResult } from "./tool-result.types";

/**
 * Execute a tool by name with the given raw parameters.
 * 1. Finds the tool in the allowedTools list
 * 2. Validates params against the tool's Zod schema
 * 3. Calls the execute handler
 * 4. Returns a standardized ToolResult
 *
 * Never throws — every code path returns a ToolResult.
 */
export async function executeTool(
  toolName: string,
  rawParams: unknown,
  context: ToolExecutionContext,
  allowedTools: AIToolDefinition[]
): Promise<ToolResult> {
  const tool = allowedTools.find((t) => t.name === toolName);

  if (!tool) {
    return {
      success: false,
      toolName,
      error: `Tool '${toolName}' is not available for your role.`,
      errorCode: "PERMISSION_DENIED",
    };
  }

  const parseResult = tool.parameters.safeParse(rawParams);

  if (!parseResult.success) {
    const issues = parseResult.error.issues
      .map((i) => {
        const path = i.path.join(".");
        return path ? `${path}: ${i.message}` : i.message;
      })
      .join("; ");

    console.log(`[ToolExecutor] '${toolName}' VALIDATION_FAILED: ${issues}`);

    return {
      success: false,
      toolName,
      error: `Invalid parameters for tool '${toolName}': ${issues}`,
      errorCode: "VALIDATION_FAILED",
    };
  }

  if (!tool.execute) {
    return {
      success: false,
      toolName,
      error: `Tool '${toolName}' has no execute handler.`,
      errorCode: "EXECUTION_FAILED",
    };
  }

  try {
    const paramKeys = Object.keys(parseResult.data as Record<string, unknown>).join(", ");
    console.log(`[ToolExecutor] Calling '${toolName}' with keys: ${paramKeys}`);

    const result = await tool.execute(parseResult.data, context);

    if (result === null) {
      console.log(`[ToolExecutor] '${toolName}' returned null (NOT_FOUND)`);
      return {
        success: false,
        toolName,
        error: "The requested resource was not found.",
        errorCode: "NOT_FOUND",
      };
    }

    console.log(`[ToolExecutor] '${toolName}' succeeded`);
    return {
      success: true,
      toolName,
      data: result,
    };
  } catch (err) {
    console.error(`[ToolExecutor] '${toolName}' threw:`, err);
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      toolName,
      error: `Tool '${toolName}' failed to execute: ${message}`,
      errorCode: "EXECUTION_FAILED",
    };
  }
}
