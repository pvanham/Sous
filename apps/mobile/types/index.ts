export type {
  ShiftDTO,
  StaffDTO,
  StaffSkill,
  TimeOffRequestDTO,
  TimeOffRequestStatus,
  ScheduleDTO,
  ScheduleStatus,
} from "@sous/types";

// ── Mobile-specific types ────────────────────────────────────

export type AnnouncementPriority = "urgent" | "high" | "normal" | "low";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  priority: AnnouncementPriority;
}

export type TimeOffRequestType = "pto" | "sick" | "unpaid";

export interface CreateTimeOffRequestInput {
  startDate: Date;
  endDate: Date;
  type: TimeOffRequestType;
  reason?: string;
}

export type ExchangeShiftStatus =
  | "available"
  | "pending_coverage"
  | "covered"
  | "manager_approved";

export interface ExchangeShift {
  id: string;
  shiftId: string;
  orgId: string;
  locationId: string;
  scheduleId: string;
  staffId: string;
  droppedByName: string;
  start: Date;
  end: Date;
  station: string;
  status: ExchangeShiftStatus;
  createdAt: Date;
}
