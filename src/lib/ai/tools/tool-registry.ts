import type { AIToolDefinition } from "./tool-registry.types";
import { defineTool } from "./tool-registry.types";
import {
  getScheduleHealthParamsSchema,
  getShiftRosterParamsSchema,
  getStaffSummaryParamsSchema,
  getTimeOffRequestsParamsSchema,
  proposeShiftSwapParamsSchema,
  proposeScheduleGenerationParamsSchema,
  executeGetScheduleHealth,
  executeGetShiftRoster,
  executeGetStaffSummary,
  executeGetTimeOffRequests,
  executeProposeShiftSwap,
  executeProposeScheduleGeneration,
} from "./definitions";

const TOOL_REGISTRY: AIToolDefinition[] = [
  defineTool({
    name: "get_schedule_health",
    description:
      "Analyze a schedule's health: total shifts, hours, overtime risks, manager coverage gaps, and unscheduled staff.",
    requiredPermission: "schedule:read",
    parameters: getScheduleHealthParamsSchema,
    execute: executeGetScheduleHealth,
  }),
  defineTool({
    name: "get_shift_roster",
    description:
      "Get a paginated list of shifts for a schedule, optionally filtered by staff member or day of week.",
    requiredPermission: "shift:read",
    parameters: getShiftRosterParamsSchema,
    execute: executeGetShiftRoster,
  }),
  defineTool({
    name: "get_staff_summary",
    description:
      "Get an aggregated summary of the staff roster: role distribution, station coverage, and hour allocations.",
    requiredPermission: "staff:read",
    parameters: getStaffSummaryParamsSchema,
    execute: executeGetStaffSummary,
  }),
  defineTool({
    name: "get_time_off_requests",
    description:
      "Get a paginated list of time-off requests within a date range, with optional status and staff filters.",
    requiredPermission: "staff:read",
    parameters: getTimeOffRequestsParamsSchema,
    execute: executeGetTimeOffRequests,
  }),
  defineTool({
    name: "propose_shift_swap",
    description:
      "Propose reassigning a shift to a different staff member. Returns a proposal for user confirmation.",
    requiredPermission: "shift:swap",
    parameters: proposeShiftSwapParamsSchema,
    execute: executeProposeShiftSwap,
  }),
  defineTool({
    name: "propose_schedule_generation",
    description:
      "Propose generating a new weekly schedule using the constraint solver. Returns a proposal for user confirmation.",
    requiredPermission: "schedule:generate",
    parameters: proposeScheduleGenerationParamsSchema,
    execute: executeProposeScheduleGeneration,
  }),
];

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
