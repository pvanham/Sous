import { createElement } from "react";

import { NotificationService } from "@/server/services/notification.service";
import { NotificationEmail } from "@/lib/email/templates/NotificationEmail";
import type {
  AnnouncementDTO,
  ExchangeShiftDTO,
  ScheduleDTO,
  ShiftDTO,
  TimeOffRequestDTO,
} from "@sous/types";

/**
 * Per-category notification builders.
 *
 * Centralising these keeps the trigger sites in services / actions
 * down to a single line and ensures every category renders a
 * consistent push title + email subject. Callers should always go
 * through these helpers; ad-hoc `NotificationService.notify` calls
 * are reserved for one-off emissions (e.g. billing webhooks).
 *
 * Every helper is fire-and-forget — internally each `await`s the
 * dispatcher, but the dispatcher itself never throws, so callers
 * almost always invoke these with `void`.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Helper: format a Date as a short, locale-friendly week label. */
function formatWeek(weekStart: Date): string {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function formatShiftWindow(shift: { start: Date; end: Date }): string {
  const fmtDay = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const fmtTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${fmtDay.format(shift.start)} ${fmtTime.format(shift.start)}–${fmtTime.format(shift.end)}`;
}

export const NotificationEvents = {
  schedulePublished({
    schedule,
    orgId,
    locationId,
  }: {
    schedule: ScheduleDTO;
    orgId: string;
    locationId: string;
  }): Promise<void> {
    const week = formatWeek(new Date(schedule.weekStartDate));
    const title = "Schedule published";
    const body = `Week of ${week} is live.`;
    return NotificationService.notify({
      recipients: { allStaffOf: { orgId, locationId } },
      category: "schedule_published",
      orgId,
      locationId,
      payload: {
        title,
        body,
        data: {
          url: "sous://schedule",
          scheduleId: schedule.id,
          category: "schedule_published",
        },
        email: {
          subject: `Your schedule for ${week} is live`,
          react: createElement(NotificationEmail, {
            preview: body,
            heading: title,
            paragraphs: [
              `Your manager just published the schedule for ${week}.`,
              "Open the Sous app to see your shifts and confirm you're all set.",
            ],
            cta: { label: "Open Sous", url: `${APP_URL}/dashboard/schedule` },
          }),
        },
      },
    });
  },

  scheduleUnpublished({
    schedule,
    orgId,
    locationId,
  }: {
    schedule: ScheduleDTO;
    orgId: string;
    locationId: string;
  }): Promise<void> {
    const week = formatWeek(new Date(schedule.weekStartDate));
    const title = "Schedule pulled back to draft";
    const body = `Week of ${week} is being revised.`;
    return NotificationService.notify({
      recipients: { allStaffOf: { orgId, locationId } },
      category: "schedule_unpublished",
      orgId,
      locationId,
      payload: {
        title,
        body,
        data: { url: "sous://schedule", category: "schedule_unpublished" },
        email: {
          subject: `Your schedule for ${week} is being revised`,
          react: createElement(NotificationEmail, {
            preview: body,
            heading: title,
            paragraphs: [
              `Your manager pulled the ${week} schedule back to draft. Treat your shifts as tentative until they republish.`,
            ],
          }),
        },
      },
    });
  },

  shiftAssignmentChanged({
    shift,
    affectedClerkUserIds,
    orgId,
    locationId,
    reason,
  }: {
    shift: ShiftDTO;
    affectedClerkUserIds: readonly string[];
    orgId: string;
    locationId: string;
    reason: "assigned" | "updated" | "unassigned";
  }): Promise<void> {
    if (affectedClerkUserIds.length === 0) return Promise.resolve();
    const window = formatShiftWindow(shift);
    const title =
      reason === "unassigned"
        ? "A shift was removed from your week"
        : reason === "assigned"
          ? "You picked up a new shift"
          : "A shift on your schedule changed";
    const body = `${shift.station} • ${window}`;
    return NotificationService.notify({
      recipients: { clerkUserIds: affectedClerkUserIds },
      category: "shift_assignment_changed",
      orgId,
      locationId,
      payload: {
        title,
        body,
        data: {
          url: "sous://schedule",
          shiftId: shift.id,
          category: "shift_assignment_changed",
        },
        email: {
          subject: title,
          react: createElement(NotificationEmail, {
            preview: body,
            heading: title,
            paragraphs: [
              `Your schedule was updated: ${shift.station} on ${window}.`,
              "Double-check the Sous app and confirm your week looks right.",
            ],
            cta: { label: "Open Sous", url: `${APP_URL}/dashboard/schedule` },
          }),
        },
      },
    });
  },

  managerCoverageGap({
    schedule,
    summary,
    orgId,
    locationId,
  }: {
    schedule: ScheduleDTO;
    summary: string;
    orgId: string;
    locationId: string;
  }): Promise<void> {
    const week = formatWeek(new Date(schedule.weekStartDate));
    const title = `Manager coverage gap for ${week}`;
    return NotificationService.notify({
      recipients: { managersOf: { orgId, locationId } },
      category: "manager_coverage_gap",
      orgId,
      locationId,
      payload: {
        title,
        body: summary,
        data: {
          url: "sous://schedule",
          scheduleId: schedule.id,
          category: "manager_coverage_gap",
        },
        email: {
          subject: title,
          react: createElement(NotificationEmail, {
            preview: summary,
            heading: title,
            paragraphs: [
              `Heads up: ${summary}`,
              "Open the schedule to review the affected days.",
            ],
            cta: { label: "Review schedule", url: `${APP_URL}/dashboard/schedule` },
          }),
        },
      },
    });
  },

  timeOffSubmitted({
    request,
    staffName,
    orgId,
    locationId,
  }: {
    request: TimeOffRequestDTO;
    staffName: string;
    orgId: string;
    locationId: string;
  }): Promise<void> {
    const title = `Time-off request from ${staffName}`;
    const body = `${formatRange(request.startDate, request.endDate)} • ${request.type}`;
    return NotificationService.notify({
      recipients: { managersOf: { orgId, locationId } },
      category: "time_off_submitted",
      orgId,
      locationId,
      payload: {
        title,
        body,
        data: {
          url: "sous://time-off",
          requestId: request.id,
          category: "time_off_submitted",
        },
        email: {
          subject: title,
          react: createElement(NotificationEmail, {
            preview: body,
            heading: title,
            paragraphs: [
              `${staffName} submitted a time-off request for ${formatRange(request.startDate, request.endDate)}.`,
              request.reason
                ? `Reason: "${request.reason}"`
                : "No reason provided.",
            ],
            cta: { label: "Review request", url: `${APP_URL}/dashboard/time-off` },
          }),
        },
      },
    });
  },

  timeOffDecision({
    request,
    requesterClerkUserId,
    orgId,
    locationId,
  }: {
    request: TimeOffRequestDTO;
    requesterClerkUserId: string;
    orgId: string;
    locationId: string;
  }): Promise<void> {
    const decision =
      request.status === "approved"
        ? "approved"
        : request.status === "denied"
          ? "denied"
          : null;
    if (!decision) return Promise.resolve();
    const range = formatRange(request.startDate, request.endDate);
    const title = `Time-off ${decision}`;
    const body = `${range}`;
    return NotificationService.notify({
      recipients: { clerkUserIds: [requesterClerkUserId] },
      category: "time_off_decision",
      orgId,
      locationId,
      payload: {
        title,
        body,
        data: {
          url: "sous://time-off",
          requestId: request.id,
          category: "time_off_decision",
        },
        email: {
          subject: `Your time-off request was ${decision}`,
          react: createElement(NotificationEmail, {
            preview: body,
            heading: title,
            paragraphs: [
              `Your time-off request for ${range} was ${decision} by your manager.`,
              request.notes ? `Note: "${request.notes}"` : "",
            ].filter(Boolean),
          }),
        },
      },
    });
  },

  exchangeNewDrop({
    exchange,
    orgId,
    locationId,
  }: {
    exchange: ExchangeShiftDTO;
    orgId: string;
    locationId: string;
  }): Promise<void> {
    const window = formatShiftWindow({
      start: exchange.start,
      end: exchange.end,
    });
    const title = "New shift on the exchange board";
    const body = `${exchange.station} • ${window}`;
    return NotificationService.notify({
      recipients: { allStaffOf: { orgId, locationId } },
      category: "exchange_new_drop",
      orgId,
      locationId,
      payload: {
        title,
        body,
        data: {
          url: "sous://exchange",
          exchangeId: exchange.id,
          category: "exchange_new_drop",
        },
        email: {
          subject: title,
          react: createElement(NotificationEmail, {
            preview: body,
            heading: title,
            paragraphs: [
              `${exchange.droppedByName} just dropped a ${exchange.station} shift on ${window}.`,
              "Pick it up in the Sous app if you want it.",
            ],
            cta: { label: "Open exchange", url: `${APP_URL}/dashboard/schedule` },
          }),
        },
      },
    });
  },

  exchangePendingApproval({
    exchange,
    orgId,
    locationId,
  }: {
    exchange: ExchangeShiftDTO;
    orgId: string;
    locationId: string;
  }): Promise<void> {
    const window = formatShiftWindow({
      start: exchange.start,
      end: exchange.end,
    });
    const title = "Shift swap awaiting approval";
    const body = `${exchange.pickedUpByName ?? "Someone"} wants ${exchange.droppedByName}'s ${exchange.station} shift (${window})`;
    return NotificationService.notify({
      recipients: { managersOf: { orgId, locationId } },
      category: "exchange_pending_approval",
      orgId,
      locationId,
      payload: {
        title,
        body,
        data: {
          url: "sous://exchange",
          exchangeId: exchange.id,
          category: "exchange_pending_approval",
        },
        email: {
          subject: title,
          react: createElement(NotificationEmail, {
            preview: body,
            heading: title,
            paragraphs: [body, "Open the exchange board to approve or deny."],
            cta: { label: "Review swap", url: `${APP_URL}/dashboard/schedule` },
          }),
        },
      },
    });
  },

  exchangeDecision({
    exchange,
    decision,
    notifyClerkUserIds,
    orgId,
    locationId,
  }: {
    exchange: ExchangeShiftDTO;
    decision:
      | "covered"
      | "approved"
      | "denied"
      | "cancelled"
      | "withdrawn";
    notifyClerkUserIds: readonly string[];
    orgId: string;
    locationId: string;
  }): Promise<void> {
    if (notifyClerkUserIds.length === 0) return Promise.resolve();
    const window = formatShiftWindow({
      start: exchange.start,
      end: exchange.end,
    });
    const title = `Shift swap ${decision}`;
    const body = `${exchange.station} • ${window}`;
    return NotificationService.notify({
      recipients: { clerkUserIds: notifyClerkUserIds },
      category: "exchange_decision",
      orgId,
      locationId,
      payload: {
        title,
        body,
        data: {
          url: "sous://exchange",
          exchangeId: exchange.id,
          category: "exchange_decision",
        },
        email: {
          subject: title,
          react: createElement(NotificationEmail, {
            preview: body,
            heading: title,
            paragraphs: [
              `An exchange you were part of was ${decision}: ${exchange.station} on ${window}.`,
            ],
          }),
        },
      },
    });
  },

  announcementCreated({
    announcement,
    orgId,
    locationId,
  }: {
    announcement: AnnouncementDTO;
    orgId: string;
    locationId: string;
  }): Promise<void> {
    const title = announcement.title;
    const body = announcement.body.slice(0, 140);
    return NotificationService.notify({
      recipients: { allStaffOf: { orgId, locationId } },
      category: "announcements",
      orgId,
      locationId,
      payload: {
        title,
        body,
        data: {
          url: "sous://home",
          announcementId: announcement.id,
          category: "announcements",
        },
        email: {
          subject: `New announcement: ${announcement.title}`,
          react: createElement(NotificationEmail, {
            preview: body,
            heading: title,
            paragraphs: [
              `${announcement.authorName} posted an announcement at your location:`,
              announcement.body,
            ],
          }),
        },
      },
    });
  },

  scheduleGenerationDone({
    initiatorClerkUserId,
    success,
    detail,
    orgId,
    locationId,
  }: {
    initiatorClerkUserId: string;
    success: boolean;
    detail?: string;
    orgId: string;
    locationId: string;
  }): Promise<void> {
    const title = success
      ? "Schedule draft is ready"
      : "Schedule generation failed";
    const body =
      detail ??
      (success
        ? "Open the schedule tab to review the proposed week."
        : "Something went wrong while generating the schedule.");
    return NotificationService.notify({
      recipients: { clerkUserIds: [initiatorClerkUserId] },
      category: "schedule_generation_async",
      orgId,
      locationId,
      payload: {
        title,
        body,
        data: {
          url: "sous://schedule",
          category: "schedule_generation_async",
        },
        email: {
          subject: title,
          react: createElement(NotificationEmail, {
            preview: body,
            heading: title,
            paragraphs: [body],
            cta: { label: "Open Sous", url: `${APP_URL}/dashboard/schedule` },
          }),
        },
      },
    });
  },

  billingAlert({
    ownerClerkUserIds,
    title,
    body,
    orgId,
  }: {
    ownerClerkUserIds: readonly string[];
    title: string;
    body: string;
    orgId: string;
  }): Promise<void> {
    if (ownerClerkUserIds.length === 0) return Promise.resolve();
    return NotificationService.notify({
      recipients: { clerkUserIds: ownerClerkUserIds },
      category: "billing_alerts",
      orgId,
      payload: {
        title,
        body,
        data: { url: "sous://settings/billing", category: "billing_alerts" },
        email: {
          subject: title,
          react: createElement(NotificationEmail, {
            preview: body,
            heading: title,
            paragraphs: [body],
            cta: {
              label: "Manage billing",
              url: `${APP_URL}/dashboard/billing`,
            },
          }),
        },
      },
    });
  },
};

function formatRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  if (start.toDateString() === end.toDateString()) {
    return fmt.format(start);
  }
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}
