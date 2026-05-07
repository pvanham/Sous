"use server";

import { auth } from "@clerk/nextjs/server";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { ExchangeShiftService } from "@/server/services/exchange-shift.service";
import {
  approveExchangeShiftSchema,
  cancelExchangeShiftSchema,
  denyExchangeShiftSchema,
  listExchangeShiftsForManagerSchema,
} from "@/lib/validations/exchange-shift.schema";
import type { ActionResponse } from "@/lib/safe-action";
import type {
  ExchangeShiftDTO,
  ExchangeShiftViabilityDTO,
} from "@/types/exchange-shift";
import type { MemberRole } from "@sous/types";

/**
 * Web (manager dashboard) Server Actions for the shift-exchange board.
 *
 * The mobile app talks to the same lifecycle through the REST routes
 * under `/api/exchange/*` because the staff client expects fetch-based
 * JSON responses. The manager UI on the web side prefers Server
 * Actions to keep the `ActionResponse<T>` discriminated union and the
 * Clerk session resolution in one place.
 *
 * Authorization model:
 *   - Listing and viewing viability is open to anyone with a manager
 *     dashboard membership (the dashboard layout already redirects
 *     plain `staff` to `/staff-blocked`).
 *   - Approve / deny / cancel are gated to owner / manager /
 *     shift_lead via `assertManagerRole(ctx.role)`.
 */

const MANAGER_ROLES: ReadonlyArray<MemberRole> = [
  "owner",
  "manager",
  "shift_lead",
];

function assertManagerRole(role: MemberRole): void {
  if (!MANAGER_ROLES.includes(role)) {
    throw new Error("Only managers can act on exchange shifts");
  }
}

/**
 * List every exchange row for the active location, optionally
 * filtered by a single status. Sorted by `updatedAt` desc so the
 * freshest activity surfaces first.
 */
export async function listExchangeShiftsForManager(
  input: unknown
): Promise<ActionResponse<ExchangeShiftDTO[]>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = listExchangeShiftsForManagerSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    const rows = await ExchangeShiftService.listForManager(
      ctx.orgId,
      ctx.locationId,
      { status: parsed.data.status, limit: parsed.data.limit }
    );
    return { success: true, data: rows };
  } catch (error) {
    console.error("listExchangeShiftsForManager error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to list exchange shifts",
    };
  }
}

/**
 * Compute viability info (hours, skills, role overlap, clopen risk,
 * overtime risk, schedule overlap) for a single exchange row. Read
 * only — the result is never persisted.
 */
export async function getExchangeShiftViability(
  exchangeId: string
): Promise<ActionResponse<ExchangeShiftViabilityDTO>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  if (!exchangeId || typeof exchangeId !== "string") {
    return { success: false, error: "Invalid exchange ID" };
  }

  try {
    const ctx = await getLocationContext(userId);
    const viability = await ExchangeShiftService.getViability(
      ctx.orgId,
      ctx.locationId,
      exchangeId
    );
    if (!viability) {
      return { success: false, error: "Exchange shift not found" };
    }
    return { success: true, data: viability };
  } catch (error) {
    console.error("getExchangeShiftViability error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to compute viability",
    };
  }
}

/**
 * Approve a pending exchange. Reassigns the underlying Shift and
 * transitions the row to `manager_approved`.
 */
export async function approveExchangeShift(
  input: unknown
): Promise<ActionResponse<ExchangeShiftDTO>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = approveExchangeShiftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    assertManagerRole(ctx.role);
    const updated = await ExchangeShiftService.approve({
      orgId: ctx.orgId,
      locationId: ctx.locationId,
      exchangeId: parsed.data.exchangeId,
      approverClerkUserId: userId,
    });
    return { success: true, data: updated };
  } catch (error) {
    console.error("approveExchangeShift error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to approve exchange shift",
    };
  }
}

/**
 * Deny a pending exchange. Transitions the row to `denied`; the
 * underlying Shift stays with the dropper.
 */
export async function denyExchangeShift(
  input: unknown
): Promise<ActionResponse<ExchangeShiftDTO>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = denyExchangeShiftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    assertManagerRole(ctx.role);
    const updated = await ExchangeShiftService.deny({
      orgId: ctx.orgId,
      locationId: ctx.locationId,
      exchangeId: parsed.data.exchangeId,
      deniedByClerkUserId: userId,
      notes: parsed.data.notes,
    });
    return { success: true, data: updated };
  } catch (error) {
    console.error("denyExchangeShift error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to deny exchange shift",
    };
  }
}

/**
 * Cancel a still-`available` drop on the dropper's behalf. Skips the
 * ownership check that the mobile-side `cancel` enforces.
 */
export async function cancelExchangeShiftAsManager(
  input: unknown
): Promise<ActionResponse<ExchangeShiftDTO>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = cancelExchangeShiftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    assertManagerRole(ctx.role);
    const updated = await ExchangeShiftService.cancelAsManager({
      orgId: ctx.orgId,
      locationId: ctx.locationId,
      exchangeId: parsed.data.exchangeId,
    });
    return { success: true, data: updated };
  } catch (error) {
    console.error("cancelExchangeShiftAsManager error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to cancel exchange shift",
    };
  }
}
