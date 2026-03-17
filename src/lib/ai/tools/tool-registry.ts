import type { AIToolDefinition } from "./tool-registry.types";

/**
 * Master tool registry. Phase 2 will add full tool implementations.
 * For Phase 1, this is the source of truth for permission-gating.
 */
const TOOL_REGISTRY: AIToolDefinition[] = [];

const names = TOOL_REGISTRY.map((t) => t.name);
const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
if (duplicates.length > 0) {
  throw new Error(
    `TOOL_REGISTRY integrity error: duplicate tool name '${duplicates[0]}' detected`
  );
}

export function getToolRegistry(): readonly AIToolDefinition[] {
  return Object.freeze([...TOOL_REGISTRY]);
}
