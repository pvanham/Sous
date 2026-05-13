import type { AIToolDefinition } from "./tool-registry.types";
import { defineTool } from "./tool-registry.types";
import {
  resolveScheduleParamsSchema,
  getScheduleHealthParamsSchema,
  getShiftRosterParamsSchema,
  getStaffSummaryParamsSchema,
  getTimeOffRequestsParamsSchema,
  proposeShiftSwapParamsSchema,
  proposeScheduleGenerationParamsSchema,
  proposeAcceptGeneratedScheduleParamsSchema,
  executeResolveSchedule,
  executeGetScheduleHealth,
  executeGetShiftRoster,
  executeGetStaffSummary,
  executeGetTimeOffRequests,
  executeProposeShiftSwap,
  executeProposeScheduleGeneration,
  executeProposeAcceptGeneratedSchedule,
} from "./definitions";

const TOOL_REGISTRY: AIToolDefinition[] = [
  defineTool({
    name: "resolve_schedule",
    description:
      "Resolve a date to its weekly schedule. Pass any date (ISO format) and the tool " +
      "returns the scheduleId for that week, along with the week's status and shift count. " +
      "ALWAYS call this tool first before calling get_shift_roster or get_schedule_health " +
      "to ensure you are querying the correct week.",
    requiredPermission: "schedule:read",
    parameters: resolveScheduleParamsSchema,
    execute: executeResolveSchedule,
  }),
  defineTool({
    name: "get_schedule_health",
    description:
      "Analyze a schedule's health: total shifts, hours, overtime risks, manager coverage gaps, and unscheduled staff. Requires a scheduleId from resolve_schedule. Falls back to most recent schedule if omitted, which may not be the week the user intended.",
    requiredPermission: "schedule:read",
    parameters: getScheduleHealthParamsSchema,
    execute: executeGetScheduleHealth,
  }),
  defineTool({
    name: "get_shift_roster",
    description:
      "Get a paginated list of shifts for a schedule. Omit staffId to get ALL staff shifts; provide a specific staffId to filter to one person. Omit dayOfWeek to get all days; provide 0-6 (where 0 is the location's configured first day of the week, default Monday) to filter to one day. Requires a scheduleId from resolve_schedule. Falls back to most recent schedule if omitted, which may not be the week the user intended. Never pass literal strings like 'all' for staffId — omit the field instead.",
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
      "Get a paginated list of time-off requests within a date range, with optional status and staff filters. " +
      "ALWAYS use a wide date range covering both past and future (e.g. 6 months back through 6 months ahead) " +
      "unless the user specifies an explicit date range. Pending requests can exist for any date.",
    requiredPermission: "staff:read",
    parameters: getTimeOffRequestsParamsSchema,
    execute: executeGetTimeOffRequests,
  }),
  defineTool({
    name: "propose_shift_swap",
    description:
      "Propose reassigning a shift to a different staff member. Returns a proposal for user confirmation. Provide targetStaffName for name-based lookup or targetStaffId if you already have the ID. If both are given, targetStaffId takes precedence.",
    requiredPermission: "shift:swap",
    parameters: proposeShiftSwapParamsSchema,
    execute: executeProposeShiftSwap,
  }),
  defineTool({
    name: "propose_schedule_generation",
    description:
      "Propose generating a new weekly schedule using the constraint solver. Only weekStartDate (ISO date for the location's configured first day of the week, default Monday) is required. " +
      "templateScheduleId and additionalInstructions are fully optional — omit them unless the user explicitly provides them. " +
      "Do NOT ask the user for a template ID; just call the tool with weekStartDate. Returns a proposal for user confirmation.",
    requiredPermission: "schedule:generate",
    parameters: proposeScheduleGenerationParamsSchema,
    execute: executeProposeScheduleGeneration,
  }),
  defineTool({
    name: "propose_accept_generated_schedule",
    description:
      "Propose accepting a generated schedule from a completed solver task. Call this after the schedule solver has completed to let the user confirm and save the generated shifts.",
    requiredPermission: "schedule:generate",
    parameters: proposeAcceptGeneratedScheduleParamsSchema,
    execute: executeProposeAcceptGeneratedSchedule,
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
