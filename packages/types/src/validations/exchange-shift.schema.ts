import { z } from "zod";

/**
 * Allowed lifecycle values for an `ExchangeShift`.
 *
 * Mirrors `ExchangeShiftStatus` in `packages/types/src/index.ts`. Two
 * places list these values so each can stay self-contained without a
 * circular import (the DTO module otherwise has no reason to depend
 * on Zod, and vice-versa).
 */
export const exchangeShiftStatusValues = [
  "available",
  "pending_coverage",
  "covered",
  "manager_approved",
  "denied",
  "cancelled",
] as const;

/**
 * Schema for the body of `POST /api/shifts/:shiftId/drop`.
 *
 * The owning `shiftId` comes from the URL, not the body, so the
 * request payload only carries the optional reason note.
 */
export const dropShiftSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, "Reason must be 500 characters or less")
    .optional()
    .default(""),
});

/**
 * Schema for the (currently empty) body of
 * `POST /api/exchange/:exchangeId/pickup`. Defined as an explicit
 * object so callers get a typed result and so future fields (e.g.
 * `acceptOvertime: boolean`) have an obvious landing spot.
 */
export const pickupExchangeShiftSchema = z.object({});

/**
 * Schema for listing the `available` board.
 *
 * `excludeStaffId` is the resolved caller's `Staff.id`. The action /
 * route handler MUST set this server-side so the staff member never
 * sees their own drops in the "available" feed.
 */
export const listAvailableExchangeShiftsSchema = z.object({
  excludeStaffId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

/**
 * Schema for "show me the shifts I have dropped". `staffId` is
 * resolved from the caller's identity in the action layer.
 */
export const listMyExchangeShiftsSchema = z.object({
  staffId: z.string().min(1, "Staff ID is required"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

/**
 * Schema for the manager-side approval transition (e.g.
 * shift-lead approval of a `pending_coverage` exchange).
 */
export const approveExchangeShiftSchema = z.object({
  exchangeId: z.string().min(1, "Exchange shift ID is required"),
});

/**
 * Schema for cancelling a still-`available` drop. The dropper or a
 * manager calls this; ownership is enforced in the service.
 */
export const cancelExchangeShiftSchema = z.object({
  exchangeId: z.string().min(1, "Exchange shift ID is required"),
});

/**
 * Schema for the manager-side denial transition (e.g. shift-lead /
 * manager rejects a `pending_coverage` exchange). Optional `notes`
 * captures the reason shown back to the dropper / picker.
 */
export const denyExchangeShiftSchema = z.object({
  exchangeId: z.string().min(1, "Exchange shift ID is required"),
  notes: z
    .string()
    .trim()
    .max(500, "Notes must be 500 characters or less")
    .optional()
    .default(""),
});

/**
 * Schema for the manager dashboard list endpoint. Optional `status`
 * filter scopes the result; omitting it returns everything for the
 * tenant ordered by most-recently-updated first.
 */
export const listExchangeShiftsForManagerSchema = z.object({
  status: z.enum(exchangeShiftStatusValues).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
});

export type DropShiftInput = z.infer<typeof dropShiftSchema>;
export type PickupExchangeShiftInput = z.infer<
  typeof pickupExchangeShiftSchema
>;
export type ListAvailableExchangeShiftsInput = z.infer<
  typeof listAvailableExchangeShiftsSchema
>;
export type ListMyExchangeShiftsInput = z.infer<
  typeof listMyExchangeShiftsSchema
>;
export type ApproveExchangeShiftInput = z.infer<
  typeof approveExchangeShiftSchema
>;
export type CancelExchangeShiftInput = z.infer<
  typeof cancelExchangeShiftSchema
>;
export type DenyExchangeShiftInput = z.infer<
  typeof denyExchangeShiftSchema
>;
export type ListExchangeShiftsForManagerInput = z.infer<
  typeof listExchangeShiftsForManagerSchema
>;
