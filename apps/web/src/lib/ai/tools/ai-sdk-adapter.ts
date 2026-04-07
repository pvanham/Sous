import { tool, type ToolSet } from "ai";
import type { AIToolDefinition, ToolExecutionContext } from "./tool-registry.types";
import { executeTool } from "./tool-executor";
import {
  isProposalResult,
  toClientSafeProposal,
  persistProposal,
} from "../orchestrator/proposal-handler";

const VALID_TOOL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_DESCRIPTION_LENGTH = 1024;

/**
 * Convert an array of AIToolDefinitions into the ToolSet format
 * expected by the Vercel AI SDK's streamText() / generateText().
 *
 * Each tool's Zod schema is passed directly to the SDK's tool() wrapper
 * via `inputSchema`, which handles JSON Schema conversion internally.
 *
 * The ToolExecutionContext is bound into each tool's execute closure
 * so org/location/user scoping is available at execution time.
 */
export function toAISDKTools(
  tools: AIToolDefinition[],
  context: ToolExecutionContext
): ToolSet {
  const sdkTools: ToolSet = {};

  for (const def of tools) {
    if (!VALID_TOOL_NAME.test(def.name)) {
      console.warn(
        `[AISDKAdapter] Tool '${def.name}' has invalid name — skipping.`
      );
      continue;
    }

    const description =
      def.description.length > MAX_DESCRIPTION_LENGTH
        ? def.description.slice(0, MAX_DESCRIPTION_LENGTH)
        : def.description;

    if (!def.execute) {
      console.warn(
        `[AISDKAdapter] Tool '${def.name}' has no execute handler — registering as a manual tool.`
      );
      sdkTools[def.name] = tool({
        description,
        inputSchema: def.parameters,
      });
      continue;
    }

    sdkTools[def.name] = tool({
      description,
      inputSchema: def.parameters,
      execute: async (params) => {
        const result = await executeTool(def.name, params, context, tools);

        if (result.success && isProposalResult(result.data)) {
          const proposal = result.data;

          if (context.conversationId) {
            persistProposal(context.conversationId, proposal).catch((err) => {
              console.error(
                `[ProposalHandler] Failed to persist proposal '${proposal.proposalId}': ${err}`
              );
            });
          }

          return toClientSafeProposal(proposal);
        }

        return result;
      },
    });
  }

  return sdkTools;
}
