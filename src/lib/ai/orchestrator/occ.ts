import crypto from "crypto";
import type { StoredProposal } from "@/types/conversation";

export interface OCCFilterResult {
  /**
   * Mongoose filter condition for findOneAndUpdate.
   * Includes the entity ID AND the expected updatedAt timestamp.
   * If the document was modified since proposal creation, the filter
   * returns no match and Mongoose returns null — the OCC check fails atomically.
   */
  filter: Record<string, unknown>;
  /** Human-readable description of what is being version-checked */
  description: string;
}

/**
 * Compute a deterministic version string from one or more updatedAt timestamps.
 *
 * - 1 timestamp  → raw ISO string (can be embedded directly in a Mongoose filter)
 * - 2+ timestamps → sha256 hex digest of the sorted ISO strings joined with "|"
 *
 * Imported by both the Phase 2 Write Tool handlers (to generate dataVersion at
 * proposal time) and the OCC filter builder (to reconstruct expected filters).
 */
export function computeDataVersion(...timestamps: (Date | string)[]): string {
  const isoStrings = timestamps.map((t) =>
    t instanceof Date ? t.toISOString() : t
  );

  if (isoStrings.length === 1) {
    return isoStrings[0];
  }

  const sorted = [...isoStrings].sort();
  return crypto
    .createHash("sha256")
    .update(sorted.join("|"))
    .digest("hex");
}

/**
 * Build atomic OCC filter conditions for a given proposal.
 *
 * For propose_shift_swap (single entity):
 *   Returns a single filter `{ _id: shiftId, updatedAt: expectedTimestamp }`
 *   that can be passed directly to `findOneAndUpdate`. If the shift was modified
 *   since the proposal was created, the filter won't match and Mongoose returns null.
 *
 * For propose_schedule_generation (composite):
 *   Returns an array of filters — one per entity involved (schedule, kitchen config,
 *   staff). The caller must verify all of them. Each filter checks the entity's
 *   `updatedAt` against the timestamp captured at proposal time.
 */
export function buildOCCFilter(
  proposal: StoredProposal
): OCCFilterResult | OCCFilterResult[] {
  switch (proposal.toolName) {
    case "propose_shift_swap":
      return buildShiftSwapFilter(proposal);
    case "propose_schedule_generation":
      return buildScheduleGenerationFilters(proposal);
    default:
      throw new Error(
        `Unable to verify data currency for unknown tool: '${proposal.toolName}'.`
      );
  }
}

/**
 * Return a human-readable explanation of why a proposal is stale.
 * Never exposes raw hashes or timestamps — only user-friendly messages.
 */
export function getStaleReason(proposal: StoredProposal): string {
  switch (proposal.toolName) {
    case "propose_shift_swap":
      return "The shift has been modified since this proposal was created. Please review the current schedule and try again.";
    case "propose_schedule_generation":
      return "The schedule configuration or staff details have changed since this proposal was created. Please review and try again.";
    default:
      return "Unable to verify data currency. Please try again.";
  }
}

// ---------------------------------------------------------------------------
// Private builders
// ---------------------------------------------------------------------------

function buildShiftSwapFilter(proposal: StoredProposal): OCCFilterResult {
  const shiftId = proposal.payload.shiftId;
  if (typeof shiftId !== "string") {
    throw new Error("The referenced shift no longer exists.");
  }

  const expectedUpdatedAt = new Date(proposal.dataVersion);
  if (isNaN(expectedUpdatedAt.getTime())) {
    throw new Error("The referenced shift no longer exists.");
  }

  return {
    filter: { _id: shiftId, updatedAt: expectedUpdatedAt },
    description: `Shift ${shiftId} must not have been modified since ${proposal.dataVersion}`,
  };
}

function buildScheduleGenerationFilters(
  proposal: StoredProposal
): OCCFilterResult[] {
  const occ = proposal.payload._occTimestamps as
    | {
        scheduleUpdatedAt: string | null;
        configUpdatedAt: string | null;
        latestStaffUpdatedAt: string | null;
      }
    | undefined;

  if (!occ) {
    throw new Error(
      "The schedule configuration or staff details have changed since this proposal was created. Please review and try again."
    );
  }

  const filters: OCCFilterResult[] = [];

  if (occ.scheduleUpdatedAt) {
    const weekStartDate = proposal.payload.weekStartDate;
    if (typeof weekStartDate === "string") {
      filters.push({
        filter: {
          weekStartDate: new Date(weekStartDate),
          updatedAt: new Date(occ.scheduleUpdatedAt),
        },
        description: `Schedule for week ${weekStartDate} must not have been modified since ${occ.scheduleUpdatedAt}`,
      });
    }
  }

  if (occ.configUpdatedAt) {
    filters.push({
      filter: {
        updatedAt: new Date(occ.configUpdatedAt),
      },
      description: `Kitchen config must not have been modified since ${occ.configUpdatedAt}`,
    });
  }

  if (occ.latestStaffUpdatedAt) {
    filters.push({
      filter: {
        updatedAt: { $gt: new Date(occ.latestStaffUpdatedAt) },
      },
      description: `No staff record should have been modified after ${occ.latestStaffUpdatedAt}`,
    });
  }

  return filters;
}
