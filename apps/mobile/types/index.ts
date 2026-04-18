export type {
  ShiftDTO,
  StaffDTO,
  StaffSkill,
  TimeOffRequestDTO,
  TimeOffRequestStatus,
  ScheduleDTO,
  ScheduleStatus,
  // Announcements + Exchange now live in @sous/types so the mobile
  // client and the web service layer share a single canonical shape.
  AnnouncementDTO,
  AnnouncementPriority,
  ExchangeShiftDTO,
  ExchangeShiftStatus,
} from "@sous/types";

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

// ── Mobile-specific input types (no server counterpart yet) ──

export type TimeOffRequestType = "pto" | "sick" | "unpaid";

export interface CreateTimeOffRequestInput {
  startDate: Date;
  endDate: Date;
  type: TimeOffRequestType;
  reason?: string;
}
