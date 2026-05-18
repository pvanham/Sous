"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { getLocationContext } from "@/lib/auth/get-location-context";
import {
  AnnouncementService,
} from "@/server/services/announcement.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { validateAudienceEntriesWithRoleSet } from "@/lib/announcement/audience";
import { NotificationEvents } from "@/server/services/notification-events";
import { AnnouncementAcknowledgmentService } from "@/server/services/announcement-acknowledgment.service";
import { AnnouncementAnalyticsService } from "@/server/services/announcement-analytics.service";
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
  listAnnouncementsSchema,
} from "@/lib/validations/announcement.schema";
import type { ActionResponse } from "@/lib/safe-action";
import type { AnnouncementDTO } from "@/types/announcement";
import type { AnnouncementAcknowledgmentDTO } from "@/types/announcement";
import type { AnnouncementAnalyticsDTO } from "@/types/announcement-analytics";
import type { MemberRole } from "@/server/models/OrganizationMember";

// ─────────────────────────────────────────────────────────────
// PHASE-1 ANNOUNCEMENT REWRITE — DO NOT REVERT TO OLD SHAPE
//
// This action file is intentionally a compatibility shim while later
// phases implement the full manager composer and analytics flows.
//
// Do NOT reintroduce:
// - legacy expiry field names from pre-Phase-1 schema
// - 4-tier priority enum (`urgent|high|normal|low`)
// - `authorClerkUserId`
// - `Global` audience sentinel (Phase 3 replaces it with `@everyone`)
// - org-wide read paths that skip `getLocationContext` scoping
// - direct model writes for read/ack (must go through ack service)
// - manager analytics reads that bypass location scoping
// ─────────────────────────────────────────────────────────────

/**
 * Roles allowed to author / edit / delete announcements. Read-side
 * actions are open to every signed-in member of the location.
 *
 * Centralised here so the rule is auditable in one place; the
 * `orchestrator` rule (`apps/web/src/lib/ai/rbac/permissions.ts`)
 * mirrors it for the AI tool surface.
 */
const WRITE_ROLES: MemberRole[] = ["owner", "manager"];

async function validateAudienceAgainstKitchenConfig(
  orgId: string,
  locationId: string,
  targetAudience: string[]
): Promise<string | null> {
  const config = await KitchenConfigService.getByLocation(orgId, locationId);
  return validateAudienceEntriesWithRoleSet(targetAudience, config?.roles ?? []);
}

/**
 * Resolve the caller's display name from Clerk. Falls back to the
 * email or Clerk user id so we never persist `"undefined"` in the
 * `authorName` field.
 */
async function resolveAuthorName(clerkUserId: string): Promise<string> {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);

  const fullName = [user.firstName, user.lastName]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();

  if (fullName) return fullName;

  const primaryEmail = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId
  )?.emailAddress;

  return primaryEmail ?? clerkUserId;
}

/**
 * List recent announcements for the caller's location.
 *
 * Open to every role (staff use the mobile home tab, managers use
 * their authoring UI). The `includeExpired` flag is only honoured
 * for write-eligible roles so staff cannot enumerate rolled-off
 * posts by tweaking the URL.
 */
export async function listAnnouncements(
  input: unknown = {}
): Promise<ActionResponse<AnnouncementDTO[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    const parsed = listAnnouncementsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error:
          parsed.error.issues
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ") || "Invalid input",
      };
    }

    const ctx = await getLocationContext(userId);

    const includeExpired =
      parsed.data.includeExpired && WRITE_ROLES.includes(ctx.role);
    const includeDrafts =
      parsed.data.includeDrafts && WRITE_ROLES.includes(ctx.role);
    const includeScheduled =
      parsed.data.includeScheduled && WRITE_ROLES.includes(ctx.role);

    const data = await AnnouncementService.list(
      ctx.orgId,
      ctx.locationId,
      {
        limit: parsed.data.limit,
        includeExpired,
        includeDrafts,
        includeScheduled,
      }
    );

    return { success: true, data };
  } catch (error) {
    console.error("listAnnouncements error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to list announcements";
    return { success: false, error: message };
  }
}

/**
 * Create a new announcement. Manager / owner only.
 *
 * Phase 2 composer contract note:
 * `/dashboard/announcements/create` depends on this action's existing
 * ActionResponse shape (`{ success, data?, error? }`) and field semantics.
 * Phase 3 may extend role/audience logic, but must preserve this contract.
 */
export async function createAnnouncement(
  input: unknown
): Promise<ActionResponse<AnnouncementDTO>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    const parsed = createAnnouncementSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error:
          parsed.error.issues
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ") || "Invalid input",
      };
    }

    const ctx = await getLocationContext(userId);

    if (!WRITE_ROLES.includes(ctx.role)) {
      return {
        success: false,
        error: "Only managers and owners can post announcements",
      };
    }

    const audienceValidationError = await validateAudienceAgainstKitchenConfig(
      ctx.orgId,
      ctx.locationId,
      parsed.data.targetAudience
    );
    if (audienceValidationError) {
      return { success: false, error: audienceValidationError };
    }

    const authorName = await resolveAuthorName(userId);

    const data = await AnnouncementService.create({
      orgId: ctx.orgId,
      locationId: ctx.locationId,
      authorId: userId,
      authorName,
      title: parsed.data.title,
      body: parsed.data.body,
      priority: parsed.data.priority,
      targetAudience: parsed.data.targetAudience,
      tags: parsed.data.tags ?? [],
      publishDate: parsed.data.publishDate ?? null,
      expirationDate: parsed.data.expirationDate ?? null,
      attachments: parsed.data.attachments ?? [],
      requiresAcknowledgment: parsed.data.requiresAcknowledgment ?? false,
    });

    // TODO(Phase 4): Add scheduler support for future-dated announcements.
    // For now we only dispatch notifications if the announcement is
    // effectively published now.
    if (data.publishDate !== null && data.publishDate.getTime() <= Date.now()) {
      void NotificationEvents.announcementCreated({
        announcement: data,
        orgId: ctx.orgId,
        locationId: ctx.locationId,
      });
    }

    return { success: true, data };
  } catch (error) {
    console.error("createAnnouncement error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create announcement";
    return { success: false, error: message };
  }
}

/**
 * Update an existing announcement. Manager / owner only.
 */
export async function updateAnnouncement(
  input: unknown
): Promise<ActionResponse<AnnouncementDTO>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    const parsed = updateAnnouncementSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error:
          parsed.error.issues
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ") || "Invalid input",
      };
    }

    const ctx = await getLocationContext(userId);

    if (!WRITE_ROLES.includes(ctx.role)) {
      return {
        success: false,
        error: "Only managers and owners can edit announcements",
      };
    }

    if (parsed.data.targetAudience !== undefined) {
      const audienceValidationError = await validateAudienceAgainstKitchenConfig(
        ctx.orgId,
        ctx.locationId,
        parsed.data.targetAudience
      );
      if (audienceValidationError) {
        return { success: false, error: audienceValidationError };
      }
    }

    const data = await AnnouncementService.update(
      ctx.orgId,
      ctx.locationId,
      parsed.data
    );

    if (!data) {
      return { success: false, error: "Announcement not found" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("updateAnnouncement error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update announcement";
    return { success: false, error: message };
  }
}

/**
 * Hard-delete an announcement. Manager / owner only.
 *
 * `id` is the announcement document id. We accept it as a positional
 * string for parity with the other delete actions (e.g.
 * `deleteTimeOffRequest`).
 */
export async function deleteAnnouncement(
  id: string
): Promise<ActionResponse<boolean>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    if (!id || typeof id !== "string") {
      return { success: false, error: "Invalid announcement ID" };
    }

    const ctx = await getLocationContext(userId);

    if (!WRITE_ROLES.includes(ctx.role)) {
      return {
        success: false,
        error: "Only managers and owners can delete announcements",
      };
    }

    const deleted = await AnnouncementService.delete(
      ctx.orgId,
      ctx.locationId,
      id
    );

    if (!deleted) {
      return { success: false, error: "Announcement not found" };
    }

    return { success: true, data: true };
  } catch (error) {
    console.error("deleteAnnouncement error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to delete announcement";
    return { success: false, error: message };
  }
}

/**
 * List announcements bucketed by lifecycle for the manager dashboard.
 */
export async function listAnnouncementsByLifecycle(): Promise<
  ActionResponse<
    Record<"draft" | "scheduled" | "active" | "expired", AnnouncementDTO[]>
  >
> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    const ctx = await getLocationContext(userId);
    if (!WRITE_ROLES.includes(ctx.role)) {
      return {
        success: false,
        error: "Only managers and owners can view announcement management",
      };
    }

    const data = await AnnouncementService.listByLifecycle(
      ctx.orgId,
      ctx.locationId
    );
    return { success: true, data };
  } catch (error) {
    console.error("listAnnouncementsByLifecycle error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to list announcement lifecycle buckets";
    return { success: false, error: message };
  }
}

/**
 * Fetch one announcement for manager edit/duplicate flows.
 */
export async function getAnnouncementById(
  id: string
): Promise<ActionResponse<AnnouncementDTO>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    if (!id || typeof id !== "string") {
      return { success: false, error: "Invalid announcement ID" };
    }

    const ctx = await getLocationContext(userId);
    if (!WRITE_ROLES.includes(ctx.role)) {
      return {
        success: false,
        error: "Only managers and owners can view announcement details",
      };
    }

    const data = await AnnouncementService.getById(ctx.orgId, ctx.locationId, id);
    if (!data) {
      return { success: false, error: "Announcement not found" };
    }
    return { success: true, data };
  } catch (error) {
    console.error("getAnnouncementById error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch announcement";
    return { success: false, error: message };
  }
}

/**
 * Force-expire an announcement by setting expirationDate to now.
 */
export async function forceExpireAnnouncement(
  id: string
): Promise<ActionResponse<AnnouncementDTO>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    if (!id || typeof id !== "string") {
      return { success: false, error: "Invalid announcement ID" };
    }

    const ctx = await getLocationContext(userId);
    if (!WRITE_ROLES.includes(ctx.role)) {
      return {
        success: false,
        error: "Only managers and owners can force-expire announcements",
      };
    }

    const existing = await AnnouncementService.getById(ctx.orgId, ctx.locationId, id);
    if (!existing) {
      return { success: false, error: "Announcement not found" };
    }

    const now = new Date();
    if (
      existing.expirationDate !== null &&
      existing.expirationDate.getTime() <= now.getTime()
    ) {
      return { success: false, error: "Announcement is already expired" };
    }

    const updated = await AnnouncementService.update(ctx.orgId, ctx.locationId, {
      announcementId: id,
      expirationDate: now,
    });

    if (!updated) {
      return { success: false, error: "Announcement not found" };
    }

    return { success: true, data: updated };
  } catch (error) {
    console.error("forceExpireAnnouncement error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to force-expire announcement";
    return { success: false, error: message };
  }
}

/**
 * Mark an announcement as read for the currently signed-in member.
 */
export async function markAnnouncementRead(
  announcementId: string
): Promise<ActionResponse<AnnouncementAcknowledgmentDTO>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    if (!announcementId || typeof announcementId !== "string") {
      return { success: false, error: "Invalid announcement ID" };
    }

    const ctx = await getLocationContext(userId);
    const announcement = await AnnouncementService.getById(
      ctx.orgId,
      ctx.locationId,
      announcementId
    );
    if (!announcement) {
      return { success: false, error: "Announcement not found" };
    }

    const data = await AnnouncementAcknowledgmentService.markRead({
      orgId: ctx.orgId,
      locationId: ctx.locationId,
      announcementId,
      userId,
    });

    return { success: true, data };
  } catch (error) {
    console.error("markAnnouncementRead error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to mark announcement as read";
    return { success: false, error: message };
  }
}

/**
 * Acknowledge an announcement for the currently signed-in member.
 */
export async function acknowledgeAnnouncement(
  announcementId: string
): Promise<ActionResponse<AnnouncementAcknowledgmentDTO>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    if (!announcementId || typeof announcementId !== "string") {
      return { success: false, error: "Invalid announcement ID" };
    }

    const ctx = await getLocationContext(userId);
    const announcement = await AnnouncementService.getById(
      ctx.orgId,
      ctx.locationId,
      announcementId
    );
    if (!announcement) {
      return { success: false, error: "Announcement not found" };
    }
    if (!announcement.requiresAcknowledgment) {
      return { success: false, error: "Acknowledgment not required" };
    }

    const data = await AnnouncementAcknowledgmentService.acknowledge({
      orgId: ctx.orgId,
      locationId: ctx.locationId,
      announcementId,
      userId,
    });

    return { success: true, data };
  } catch (error) {
    console.error("acknowledgeAnnouncement error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to acknowledge announcement";
    return { success: false, error: message };
  }
}

/**
 * Fetch manager analytics for a single announcement.
 */
export async function getAnnouncementAnalytics(
  announcementId: string
): Promise<ActionResponse<AnnouncementAnalyticsDTO>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    if (!announcementId || typeof announcementId !== "string") {
      return { success: false, error: "Invalid announcement ID" };
    }

    const ctx = await getLocationContext(userId);
    if (!WRITE_ROLES.includes(ctx.role)) {
      return {
        success: false,
        error: "Only managers and owners can view announcement analytics",
      };
    }

    const data = await AnnouncementAnalyticsService.get(
      ctx.orgId,
      ctx.locationId,
      announcementId
    );
    if (!data) {
      return { success: false, error: "Announcement not found" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("getAnnouncementAnalytics error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch announcement analytics";
    return { success: false, error: message };
  }
}
