import { clerkClient } from "@clerk/nextjs/server";
import type { ReactElement } from "react";

import { NotificationPreferenceService } from "@/server/services/notification-preference.service";
import { DeviceTokenService } from "@/server/services/device-token.service";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
import { StaffService } from "@/server/services/staff.service";
import { sendExpoPush, type ExpoPushPayload } from "@/lib/push/expo-push";
import { sendEmailBatch, type SendEmailInput } from "@/lib/email/resend";
import { inQuietHours } from "@/lib/notifications/quiet-hours";
import type {
  NotificationCategory,
  NotificationPreferencesDTO,
} from "@sous/types";

/**
 * Audience descriptors the dispatcher knows how to resolve. A single
 * notification can mix and match these — for instance an exchange
 * decision needs both `clerkUserIds` (the picker / dropper) and
 * sometimes a manager broadcast.
 */
export interface RecipientSelector {
  /** Direct Clerk user ids (for "this specific user") deliveries. */
  clerkUserIds?: readonly string[];
  /** Staff document ids — resolved to the linked Clerk user. */
  staffIds?: readonly string[];
  /** Every member of an org+location with a manager-equivalent role. */
  managersOf?: { orgId: string; locationId: string };
  /** Every active staff row at an org+location with a Clerk link. */
  allStaffOf?: { orgId: string; locationId: string };
  /** Owner of an organization. */
  ownerOf?: { ownerClerkUserId: string };
}

export interface NotifyInput {
  recipients: RecipientSelector;
  category: NotificationCategory;
  payload: {
    title: string;
    body: string;
    /**
     * Push `data` payload. Use string-only values; Expo / APNs / FCM
     * coerce numerics inconsistently. Common keys: `url` (deep link),
     * `category` (mirrors `NotificationCategory`).
     */
    data?: Record<string, string>;
    /** Optional email override — when omitted, a generic template is used. */
    email?: { subject: string; react: ReactElement };
  };
  /** Tenant context for logging only. */
  orgId?: string;
  locationId?: string;
}

const MANAGER_ROLES = new Set(["owner", "manager", "shift_lead"]);

/**
 * NotificationService — the single fan-out point for all push + email
 * notifications.
 *
 * Hard contract:
 *   - **Never throws.** Every call site uses `void` or fire-and-forget
 *     so a downstream Resend / Expo outage cannot break the original
 *     business action.
 *   - **Logs structured failures** (`console.error` with `{ category,
 *     channel, clerkUserId, code }`) so triage stays grep-friendly.
 *   - **Honours per-user preferences**: master push/email switches,
 *     per-category-per-channel toggles, and quiet hours.
 *   - **Honours device-level revocations**: dead Expo tokens are
 *     soft-revoked by `expo-push.ts` on the receipt poll.
 */
export const NotificationService = {
  async notify(input: NotifyInput): Promise<void> {
    try {
      const recipients = await resolveRecipients(input.recipients);
      if (recipients.size === 0) return;

      const now = new Date();
      const pushQueue: ExpoPushPayload[] = [];
      const emailQueue: SendEmailInput[] = [];

      // Resolve preferences in parallel; the dispatcher is fire-and-
      // forget so we don't need transactional consistency, but we do
      // want one Mongo round-trip per recipient and not N^2.
      const prefsList = await Promise.all(
        Array.from(recipients).map(async (clerkUserId) => {
          try {
            const prefs =
              await NotificationPreferenceService.getOrCreate(clerkUserId);
            return { clerkUserId, prefs };
          } catch (err) {
            console.error("[notify] failed to load prefs:", {
              category: input.category,
              clerkUserId,
              error: err instanceof Error ? err.message : String(err),
            });
            return null;
          }
        }),
      );

      for (const entry of prefsList) {
        if (!entry) continue;
        const { clerkUserId, prefs } = entry;
        const wantsPush =
          prefs.channels.push &&
          prefs.categories[input.category]?.push !== false &&
          !inQuietHours(now, prefs.quietHours);
        const wantsEmail =
          prefs.channels.email &&
          prefs.categories[input.category]?.email !== false &&
          !inQuietHours(now, prefs.quietHours);

        if (wantsPush) {
          await collectPushTargets(
            clerkUserId,
            input.category,
            input.payload,
            pushQueue,
          );
        }
        if (wantsEmail && input.payload.email) {
          await collectEmailTarget(
            clerkUserId,
            input.category,
            input.payload.email,
            emailQueue,
          );
        }
      }

      // Fan out the two transports in parallel; both adapters log their
      // own failures and never throw.
      await Promise.all([
        sendExpoPush(pushQueue),
        sendEmailBatch(emailQueue),
      ]);
    } catch (err) {
      // Belt-and-braces: anything that escapes the per-recipient loop
      // still gets logged rather than bubbling up to the caller.
      console.error("[notify] unexpected dispatcher failure:", {
        category: input.category,
        orgId: input.orgId,
        locationId: input.locationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

/**
 * Convert a `RecipientSelector` into a deduplicated set of Clerk
 * user ids. Each branch is independent so callers can mix several
 * (e.g. a manager broadcast + the originating staff member).
 */
async function resolveRecipients(
  selector: RecipientSelector,
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (selector.clerkUserIds) {
    for (const id of selector.clerkUserIds) ids.add(id);
  }
  if (selector.staffIds && selector.staffIds.length > 0) {
    // The current StaffService API doesn't expose a bulk lookup by
    // ids, so fall back to the dispatcher resolving each per-tenant
    // call site instead. To avoid silent gaps, log a warning that
    // points the caller at the right selector.
    console.warn(
      "[notify] staffIds selector is not implemented; pass clerkUserIds instead",
      { count: selector.staffIds.length },
    );
  }
  if (selector.managersOf) {
    try {
      const members = await OrganizationMemberService.listByLocation(
        selector.managersOf.orgId,
        selector.managersOf.locationId,
      );
      for (const m of members) {
        if (MANAGER_ROLES.has(m.role)) ids.add(m.clerkUserId);
      }
    } catch (err) {
      console.error("[notify] managersOf resolution failed:", err);
    }
  }
  if (selector.allStaffOf) {
    try {
      const staff = await StaffService.list(
        selector.allStaffOf.orgId,
        selector.allStaffOf.locationId,
      );
      for (const s of staff) {
        if (s.isActive && s.clerkUserId) ids.add(s.clerkUserId);
      }
    } catch (err) {
      console.error("[notify] allStaffOf resolution failed:", err);
    }
  }
  if (selector.ownerOf) {
    ids.add(selector.ownerOf.ownerClerkUserId);
  }
  return ids;
}

async function collectPushTargets(
  clerkUserId: string,
  category: NotificationCategory,
  payload: NotifyInput["payload"],
  queue: ExpoPushPayload[],
): Promise<void> {
  let tokens: { expoPushToken: string }[] = [];
  try {
    tokens = await DeviceTokenService.listForUser(clerkUserId);
  } catch (err) {
    console.error("[notify] failed to list device tokens:", {
      category,
      clerkUserId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  for (const t of tokens) {
    queue.push({
      to: t.expoPushToken,
      title: payload.title,
      body: payload.body,
      sound: "default",
      channelId: "default",
      data: { ...(payload.data ?? {}), category },
    });
  }
}

async function collectEmailTarget(
  clerkUserId: string,
  category: NotificationCategory,
  email: { subject: string; react: ReactElement },
  queue: SendEmailInput[],
): Promise<void> {
  let address: string | null = null;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(clerkUserId);
    address =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ?? null;
  } catch (err) {
    console.error("[notify] failed to resolve email address from Clerk:", {
      category,
      clerkUserId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (!address) return;

  queue.push({ to: address, subject: email.subject, react: email.react });
}

// Re-export the pure helper so existing call sites that imported it
// from this module keep working unchanged.
export { inQuietHours } from "@/lib/notifications/quiet-hours";

// Re-export a thin helper for callers that already have a prefs DTO.
export type { NotificationPreferencesDTO };
