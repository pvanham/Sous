"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  listSkillChangeRequestsSchema,
  reviewSkillChangeSchema,
  reviewSkillChangesBatchSchema,
} from "@/lib/validations/skill-change-request.schema";
import { SkillChangeRequestService } from "@/server/services/skill-change-request.service";
import { NotificationEvents } from "@/server/services/notification-events";
import { getLocationContext } from "@/lib/auth/get-location-context";
import type { ActionResponse } from "@/lib/safe-action";
import type { SkillChangeRequestDTO } from "@/types/skill-change-request";
import type { MemberRole } from "@sous/types";

/**
 * Manager (web dashboard) Server Actions for staff-proposed skill
 * changes. The mobile staff client submits proposals through the REST
 * routes under `/api/me/skills/*`; managers act on them here.
 *
 * Listing is open to any manager-dashboard membership (the dashboard
 * layout already redirects plain `staff`). Reviewing is additionally
 * gated to owner / manager / shift_lead.
 */
const MANAGER_ROLES: ReadonlyArray<MemberRole> = [
  "owner",
  "manager",
  "shift_lead",
];

function assertManagerRole(role: MemberRole): void {
  if (!MANAGER_ROLES.includes(role)) {
    throw new Error("Only managers can review skill change requests");
  }
}

/**
 * List skill change requests for the current location, optionally
 * filtered by status / staff member.
 * @param input - `{ status?, staffId? }`
 */
export async function listSkillChangeRequests(
  input?: unknown
): Promise<ActionResponse<SkillChangeRequestDTO[]>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = listSkillChangeRequestsSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    const result = await SkillChangeRequestService.listForLocation(
      ctx.orgId,
      ctx.locationId,
      parsed.data
    );
    return { success: true, data: result };
  } catch (error) {
    console.error("listSkillChangeRequests error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to list skill change requests",
    };
  }
}

/**
 * Approve or deny a single skill change request. Approving an addition
 * activates the skill; approving a removal drops it. Notifies the
 * requesting staff member of the decision.
 * @param input - `{ requestId, decision: "approve" | "deny", notes? }`
 */
export async function reviewSkillChangeRequest(
  input: unknown
): Promise<ActionResponse<SkillChangeRequestDTO>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = reviewSkillChangeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    assertManagerRole(ctx.role);

    const result = await SkillChangeRequestService.review(
      ctx.orgId,
      ctx.locationId,
      parsed.data.requestId,
      parsed.data.decision,
      userId,
      parsed.data.notes
    );

    if (!result) {
      return {
        success: false,
        error: "Skill change request not found or already reviewed",
      };
    }

    if (result.clerkUserId) {
      void NotificationEvents.skillChangeDecision({
        request: result,
        requesterClerkUserId: result.clerkUserId,
        orgId: ctx.orgId,
        locationId: ctx.locationId,
      });
    }

    revalidatePath("/dashboard/staff");
    return { success: true, data: result };
  } catch (error) {
    console.error("reviewSkillChangeRequest error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to review skill change request",
    };
  }
}

/**
 * Approve or deny every pending request belonging to one staff member.
 * Backs the "Approve all" / "Deny all" action that clears an
 * onboarding batch in a single click. Notifies the staff member once.
 * @param input - `{ staffId, decision: "approve" | "deny", notes? }`
 */
export async function reviewSkillChangeRequestsBatch(
  input: unknown
): Promise<ActionResponse<{ resolved: number }>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = reviewSkillChangesBatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    assertManagerRole(ctx.role);

    // Snapshot the requests we're about to resolve so we can notify the
    // staff member about exactly these (and not any older decisions).
    const pending = await SkillChangeRequestService.listForStaff(
      ctx.orgId,
      ctx.locationId,
      parsed.data.staffId,
      "pending"
    );

    const resolved = await SkillChangeRequestService.reviewBatch(
      ctx.orgId,
      ctx.locationId,
      parsed.data.staffId,
      parsed.data.decision,
      userId,
      parsed.data.notes
    );

    const resolvedStatus =
      parsed.data.decision === "approve" ? "approved" : "denied";
    for (const request of pending) {
      if (!request.clerkUserId) continue;
      void NotificationEvents.skillChangeDecision({
        request: {
          ...request,
          status: resolvedStatus,
          reviewNotes: parsed.data.notes ?? request.reviewNotes,
        },
        requesterClerkUserId: request.clerkUserId,
        orgId: ctx.orgId,
        locationId: ctx.locationId,
      });
    }

    revalidatePath("/dashboard/staff");
    return { success: true, data: { resolved } };
  } catch (error) {
    console.error("reviewSkillChangeRequestsBatch error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to review skill change requests",
    };
  }
}
