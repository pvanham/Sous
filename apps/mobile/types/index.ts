export type {
  ShiftDTO,
  StaffDTO,
  StaffSkill,
  TimeOffRequestDTO,
  TimeOffRequestStatus,
  TimeOffRequestType,
  ScheduleDTO,
  ScheduleStatus,
  // Announcements + Exchange now live in @sous/types so the mobile
  // client and the web service layer share a single canonical shape.
  AnnouncementDTO,
  AnnouncementPriority,
  ExchangeShiftDTO,
  ExchangeShiftStatus,
} from "@sous/types";

// ─────────────────────────────────────────────────────────────
// PHASE-1 ANNOUNCEMENT REWRITE — DO NOT REVERT TO OLD SHAPE
//
// Announcement priority is `Standard` / `Urgent`, and date fields are
// `publishDate` / `expirationDate`.
// ─────────────────────────────────────────────────────────────

export type { SubmitTimeOffRequestInput as CreateTimeOffRequestInput } from "@sous/types/validations/time-off-request.schema";

import type {
  AnnouncementDTO,
  AnnouncementPriority,
  ExchangeShiftDTO,
  ExchangeShiftStatus,
} from "@sous/types";

// ── Mobile-only convenience aliases ──────────────────────────
//
// The mobile UI was built against the names `Announcement` and
// `ExchangeShift` before the shared types existed. We keep these
// aliases so existing components compile without churn while the
// canonical names continue to be the `*DTO` ones from `@sous/types`.

/** Alias of `AnnouncementDTO` from `@sous/types`. */
export type Announcement = AnnouncementDTO;
/** Alias of `ExchangeShiftDTO` from `@sous/types`. */
export type ExchangeShift = ExchangeShiftDTO;

// Re-export the priority / status enums under their old names too.
export type { AnnouncementPriority as MobileAnnouncementPriority };
export type { ExchangeShiftStatus as MobileExchangeShiftStatus };

