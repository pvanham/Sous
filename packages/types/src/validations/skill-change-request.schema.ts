import { z } from "zod";
import { skillSchema } from "./staff.schema";

/**
 * A skill change request captures a staff member's proposal to add or
 * remove one of their station skills. Both directions require manager
 * approval before `Staff.skills` is mutated:
 *
 * - `add`    The staff member proposes a new station + proficiency.
 *            The skill is NOT active (and therefore not schedulable)
 *            until a manager approves the request.
 * - `remove` The staff member asks to drop a station they currently
 *            hold, with a reason. The skill stays active until the
 *            manager approves the removal.
 */
export const skillChangeTypeValues = ["add", "remove"] as const;
export const skillChangeStatusValues = [
  "pending",
  "approved",
  "denied",
] as const;

export const skillChangeTypeSchema = z.enum(skillChangeTypeValues);
export const skillChangeStatusSchema = z.enum(skillChangeStatusValues);

/**
 * Submit a skill addition — used by the mobile staff app.
 *
 * Omits `staffId`: the mobile API resolves the caller's Staff record
 * server-side from their Clerk JWT. The station is validated against
 * the location's `KitchenConfig.stations` in the route handler, since
 * the catalogue is DB-stored and not available at parse time.
 */
export const submitSkillAdditionSchema = skillSchema;

/**
 * Request a skill removal — used by the mobile staff app. Requires a
 * short reason (e.g. injury, no longer working this station) that the
 * manager sees when reviewing the request.
 */
export const submitSkillRemovalSchema = z.object({
  station: z.string().min(1, "Station name is required"),
  reason: z
    .string()
    .min(1, "A reason is required")
    .max(500, "Reason must be 500 characters or less"),
});

/**
 * Manager decision on a single skill change request. Approving an
 * `add` activates the skill; approving a `remove` drops it. Denying
 * either leaves `Staff.skills` untouched.
 */
export const reviewSkillChangeSchema = z.object({
  requestId: z.string().min(1, "Request ID is required"),
  decision: z.enum(["approve", "deny"]),
  notes: z
    .string()
    .max(500, "Notes must be 500 characters or less")
    .optional(),
});

/**
 * Manager decision applied to every pending request belonging to one
 * staff member. Used by the "Approve all" / "Deny all" action that
 * clears an onboarding batch in a single click.
 */
export const reviewSkillChangesBatchSchema = z.object({
  staffId: z.string().min(1, "Staff ID is required"),
  decision: z.enum(["approve", "deny"]),
  notes: z
    .string()
    .max(500, "Notes must be 500 characters or less")
    .optional(),
});

/**
 * Filters for the manager-facing list of skill change requests.
 */
export const listSkillChangeRequestsSchema = z
  .object({
    status: skillChangeStatusSchema.optional(),
    staffId: z.string().min(1).optional(),
  })
  .optional()
  .default({});

export type SkillChangeType = (typeof skillChangeTypeValues)[number];
export type SkillChangeStatus = (typeof skillChangeStatusValues)[number];
export type SubmitSkillAdditionInput = z.infer<typeof submitSkillAdditionSchema>;
export type SubmitSkillRemovalInput = z.infer<typeof submitSkillRemovalSchema>;
export type ReviewSkillChangeInput = z.infer<typeof reviewSkillChangeSchema>;
export type ReviewSkillChangesBatchInput = z.infer<
  typeof reviewSkillChangesBatchSchema
>;
export type ListSkillChangeRequestsInput = z.infer<
  typeof listSkillChangeRequestsSchema
>;
