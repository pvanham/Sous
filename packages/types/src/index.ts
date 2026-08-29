// ============================================================
// @sous/types — Pure DTO interfaces and shared type definitions
// ============================================================
// This package contains ONLY portable type definitions that can
// be consumed by both the web app and the mobile app.
// Server-coupled types (Mongoose interfaces, toDTO converters)
// remain in apps/web/src/types/.
// ============================================================

// ── Staff ────────────────────────────────────────────────────

export interface StaffSkill {
  station: string;
  proficiency: 1 | 2 | 3 | 4 | 5;
}

/**
 * Physical mailing address attached to a staff record. Populated by
 * the staff member from the mobile profile screen; managers do not
 * currently see or edit this on the web dashboard. All fields are
 * required when the address is present — to "remove" an address,
 * callers send `address: null` (or `undefined`) to the patch route.
 */
export interface StaffAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
}

export type InvitationStatus = "not_invited" | "pending" | "accepted";

export interface StaffDTO {
  id: string;
  orgId: string;
  locationId: string;
  name: string;
  email: string;
  phone: string;
  roles: string[];
  skills: StaffSkill[];
  isActive: boolean;
  maxHoursPerWeek: number;
  minHoursPerWeek: number;
  preferredStations: string[];
  certifications: string[];
  hourlyRate: number;
  address?: StaffAddress | null;
  clerkUserId?: string | null;
  invitationStatus: InvitationStatus;
  /**
   * Timestamp of the first time the staff member finished the mobile
   * onboarding wizard. `null` until they tap "Get started" on the
   * final step; once set, `AuthGate` in the mobile app skips the
   * wizard on subsequent sessions. Managers / owners do not have a
   * Staff row so this field never applies to them.
   */
  onboardingCompletedAt: Date | null;
  /**
   * Public URL of the staff member's profile picture, mirrored from
   * Clerk so list views (rosters, schedules) can render the avatar
   * without a per-row Clerk API call. `null` (or absent) means the
   * staff member is using the Clerk default avatar; consumers should
   * fall back to initials in that case.
   */
  imageUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffListParams {
  page: number;
  pageSize: number;
  sortOrder: "asc" | "desc";
  search?: string;
}

export interface PaginatedStaffResult {
  staff: StaffDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ImportRowError {
  row: number;
  email: string;
  reason: string;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: ImportRowError[];
}

// ── Schedule ─────────────────────────────────────────────────

export type ScheduleStatus = "DRAFT" | "PUBLISHED";

export interface ScheduleDTO {
  id: string;
  orgId: string;
  locationId: string;
  weekStartDate: Date;
  status: ScheduleStatus;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Shift ────────────────────────────────────────────────────

export interface ShiftDTO {
  id: string;
  orgId: string;
  locationId: string;
  scheduleId: string;
  staffId: string;
  start: Date;
  end: Date;
  station: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateShiftInput {
  orgId: string;
  locationId: string;
  scheduleId: string;
  staffId: string;
  start: Date;
  end: Date;
  station: string;
  notes?: string;
}

export interface UpdateShiftInput {
  start?: Date;
  end?: Date;
  station?: string;
  notes?: string;
}

// ── Time Off Request ─────────────────────────────────────────

export type TimeOffRequestStatus = "pending" | "approved" | "denied";

/**
 * Category of a time-off request. Surfaced by the mobile request
 * form so staff can label the kind of leave they're asking for. The
 * web manager UI does not currently expose this field; new requests
 * created through the manager flow default to `"pto"`.
 *
 * Persisted on the `TimeOffRequest` document but not used by the CP
 * solver — the solver only cares whether a request is `approved`.
 */
export type TimeOffRequestType = "pto" | "sick" | "unpaid";

export interface TimeOffRequestDTO {
  id: string;
  orgId: string;
  locationId: string;
  staffId: string;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: TimeOffRequestStatus;
  /** Category of leave (vacation / sick / unpaid). Defaults to `"pto"`. */
  type: TimeOffRequestType;
  reviewedAt?: Date;
  reviewedBy?: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Staff Availability ───────────────────────────────────────

export type AvailabilityPreference = "preferred" | "available" | "unavailable";

export interface StaffAvailabilityDTO {
  id: string;
  orgId: string;
  locationId: string;
  staffId: string;
  dayOfWeek: number;
  availableFrom: string | null;
  availableTo: string | null;
  preference: AvailabilityPreference;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffAvailabilityInput {
  staffId: string;
  dayOfWeek: number;
  availableFrom: string | null;
  availableTo: string | null;
  preference: AvailabilityPreference;
  notes?: string;
}

export interface BulkAvailabilityInput {
  staffId: string;
  availabilities: Array<Omit<StaffAvailabilityInput, "staffId">>;
}

// ── Location ─────────────────────────────────────────────────

export interface LocationDTO {
  id: string;
  orgId: string;
  name: string;
  timezone: string;
  twilioPhoneNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLocationInput {
  orgId: string;
  name: string;
  timezone?: string;
  twilioPhoneNumber?: string;
}

export interface UpdateLocationInput {
  name?: string;
  timezone?: string;
  twilioPhoneNumber?: string | null;
}

// ── Organization ─────────────────────────────────────────────

export interface OrganizationDTO {
  id: string;
  ownerId: string;
  name: string;
  businessType?:
    | "qsr"
    | "fast_casual"
    | "fine_dining"
    | "catering"
    | "bar"
    | "cafe"
    | "other";
  subscriptionTier: "free" | "pro" | "enterprise";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrganizationInput {
  ownerId: string;
  name: string;
  businessType?:
    | "qsr"
    | "fast_casual"
    | "fine_dining"
    | "catering"
    | "bar"
    | "cafe"
    | "other";
}

export interface UpdateOrganizationInput {
  name?: string;
  businessType?:
    | "qsr"
    | "fast_casual"
    | "fine_dining"
    | "catering"
    | "bar"
    | "cafe"
    | "other";
}

// ── Organization Member ──────────────────────────────────────

export type MemberRole = "owner" | "manager" | "shift_lead" | "staff";

export interface OrganizationMemberDTO {
  id: string;
  orgId: string;
  locationId: string | null;
  clerkUserId: string;
  role: MemberRole;
  /**
   * Public URL of the member's profile picture (mirrored from Clerk).
   * Lets the manager-side schedule and dashboards render owner /
   * manager / shift-lead avatars without joining against Staff (which
   * doesn't always have a row for these roles). `null` when the
   * member hasn't uploaded an image and is using the Clerk default.
   */
  imageUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrganizationMemberInput {
  orgId: string;
  locationId?: string | null;
  clerkUserId: string;
  role: MemberRole;
}

export interface UpdateOrganizationMemberInput {
  locationId?: string | null;
  role?: MemberRole;
}

// ── Labor Requirement ────────────────────────────────────────

export type LaborPriority = "critical" | "high" | "normal" | "low";

export interface LaborRequirementDTO {
  id: string;
  orgId: string;
  locationId: string;
  dayOfWeek: number;
  station: string;
  startTime: string;
  endTime: string;
  minStaff: number;
  preferredStaff: number;
  priority: LaborPriority;
  createdAt: Date;
  updatedAt: Date;
}

// ── Kitchen Config ───────────────────────────────────────────

// Re-export the day-of-week primitive plus the numeric-conversion helpers
// so consumers can `import { DayOfWeek, dayOfWeekToIndex } from "@sous/types"`
// without reaching into the validations subpath.
export type { DayOfWeek } from "./validations/kitchen-config.schema";
export {
  DAYS_OF_WEEK,
  dayOfWeekToIndex,
  indexToDayOfWeek,
} from "./validations/kitchen-config.schema";

export interface AISettingsDTO {
  monthlyGenerationLimit: number;
  subscriptionTier: "free" | "pro" | "enterprise";
}

export interface ScheduleGenerationSettingsDTO {
  allowClopening: boolean;
  minHoursBetweenShifts: number;
  clopeningWarningThresholdHours: number;
  overtimeThresholdHours: number;
  overtimePolicy: "strict" | "avoid" | "allowed";
  softConstraintPriority: ("preferences" | "fairness" | "cost")[];
}

/** Operating hours for a single day */
export interface OperatingHoursDTO {
  isOpen: boolean;
  open?: string;
  close?: string;
}

/** Weekly operating hours — one entry per day */
export interface WeeklyOperatingHoursDTO {
  monday: OperatingHoursDTO;
  tuesday: OperatingHoursDTO;
  wednesday: OperatingHoursDTO;
  thursday: OperatingHoursDTO;
  friday: OperatingHoursDTO;
  saturday: OperatingHoursDTO;
  sunday: OperatingHoursDTO;
}

export interface KitchenConfigDTO {
  id: string;
  orgId: string;
  locationId: string;
  name: string;
  stations: string[];
  roles: string[];
  managerRoles: string[];
  operatingHours: WeeklyOperatingHoursDTO;
  minTimeOffAdvanceDays: number;
  aiSettings: AISettingsDTO;
  scheduleGenerationSettings: ScheduleGenerationSettingsDTO;
  /**
   * When `true`, staff may propose their own skill additions and
   * removals from the mobile app (both require manager approval before
   * they take effect). Defaults to `true` to reduce onboarding friction
   * for new owners; managers who want full control toggle it off.
   */
  allowStaffToManageOwnSkills: boolean;
  /**
   * Calendar day each new weekly schedule starts on. Persisted as a
   * lowercase day name (`"monday"` … `"sunday"`); helpers in
   * `@sous/types/validations/kitchen-config.schema` convert to/from the
   * date-fns numeric (`0=Sun..6=Sat`) representation.
   */
  weekStartsOn: import("./validations/kitchen-config.schema").DayOfWeek;
  createdAt: Date;
  updatedAt: Date;
}

// ── Config Change Impact (for station/role removal warnings) ─

export interface ConfigChangeImpact {
  removedStations: string[];
  removedRoles: string[];
  stationImpact: {
    affectedStaffCount: number;
    affectedStaff: Array<{
      id: string;
      name: string;
      skillsToRemove: StaffSkill[];
    }>;
    historicalShiftCount: number;
    laborRequirementCount: number;
    preferredStationStaffCount: number;
  };
  roleImpact: {
    affectedStaffCount: number;
    staffWithOnlyThisRole: Array<{
      id: string;
      name: string;
    }>;
    staffWithOtherRoles: Array<{
      id: string;
      name: string;
      remainingRoles: string[];
    }>;
  };
  requiresRoleReplacement: boolean;
  availableReplacementRoles: string[];
  /**
   * Present only when the submitted form changes `weekStartsOn`. The
   * dialog uses this to warn the owner that any future-dated schedules
   * already on disk keep their existing `weekStartDate` (the new value
   * applies to schedules created after the save).
   */
  weekStartChange?: {
    from: import("./validations/kitchen-config.schema").DayOfWeek;
    to: import("./validations/kitchen-config.schema").DayOfWeek;
    affectedFutureSchedules: number;
  };
}

export interface SaveKitchenConfigOptions {
  roleReplacement?: {
    oldRole: string;
    newRole: string;
  };
}

// ── Announcement ─────────────────────────────────────────────

/**
 * PHASE-1 ANNOUNCEMENT REWRITE — DO NOT REVERT TO OLD SHAPE
 *
 * The old values (`urgent` / `high` / `normal` / `low`) and old
 * `expiresAt` field are intentionally removed. Future work should use
 * this canonical 2-tier enum and the publish/expiration lifecycle.
 */
export type AnnouncementPriority = "Standard" | "Urgent";

export type AnnouncementLifecycleStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "expired";

/**
 * Manager-authored announcement scoped to a single location.
 *
 * Visible to every member of the location regardless of role; only
 * managers and owners can create / update / delete (enforced at the
 * action layer in the web app).
 */
export interface AnnouncementDTO {
  id: string;
  orgId: string;
  locationId: string;
  /** Clerk user id of the manager / owner who authored the post. */
  authorId: string;
  /** Display name captured at write time so deletions don't break the feed. */
  authorName: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  /** Role-targeting values and/or the `Global` sentinel. */
  targetAudience: string[];
  tags: string[];
  publishDate: Date | null;
  expirationDate: Date | null;
  attachments: string[];
  requiresAcknowledgment: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnnouncementAcknowledgmentDTO {
  id: string;
  orgId: string;
  locationId: string;
  announcementId: string;
  userId: string;
  readAt: Date | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mobile announcement feed envelope. Includes the announcement itself
 * plus the caller-scoped read/ack row when one exists.
 */
export interface AnnouncementListItemDTO {
  announcement: AnnouncementDTO;
  acknowledgment: AnnouncementAcknowledgmentDTO | null;
}

export {
  ANNOUNCEMENT_AUDIENCE_TOKENS,
  announcementPriorityValues,
  createAnnouncementSchema,
  updateAnnouncementSchema,
  listAnnouncementsSchema,
  acknowledgeAnnouncementSchema,
} from "./validations/announcement.schema";

export type {
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
  ListAnnouncementsInput,
  AcknowledgeAnnouncementInput,
} from "./validations/announcement.schema";
export {
  BUSINESS_TYPES,
  businessTypeSchema,
} from "./validations/organization.schema";
export type { BusinessType } from "./validations/organization.schema";

// ── Exchange Shift ───────────────────────────────────────────

/**
 * Lifecycle of a dropped shift on the exchange board.
 *
 * - `available`         The dropper has released the shift; nobody has
 *                       claimed it yet.
 * - `pending_coverage`  Another staff member has clicked "pick up"
 *                       and the system is waiting on shift-lead /
 *                       manager approval. v1 always routes pickups
 *                       through this state; `Shift.staffId` stays
 *                       with the original dropper until approval.
 * - `covered`           Historical status for pickups that bypassed
 *                       approval (legacy / scripted paths). The
 *                       underlying `Shift.staffId` has been
 *                       reassigned by `ExchangeShiftService.pickup`.
 *                       Still accepted by the schema so existing
 *                       rows render, but the mobile pickup route
 *                       does not emit this status anymore.
 * - `manager_approved`  Terminal status emitted by
 *                       `ExchangeShiftService.approve`. Kept
 *                       distinct from `covered` so the audit trail
 *                       can distinguish the two paths. The
 *                       underlying Shift has been reassigned to the
 *                       picker at this point.
 * - `denied`            Terminal status emitted by
 *                       `ExchangeShiftService.deny`. The underlying
 *                       Shift stays with the original dropper; the
 *                       picker is cleared. Manager notes (optional)
 *                       are surfaced to both sides.
 * - `cancelled`         The dropper (or a manager) rescinded the
 *                       drop while it was still `available` or
 *                       `pending_coverage`. Terminal. If there was
 *                       a picker, their pickup effectively
 *                       disappears.
 */
export type ExchangeShiftStatus =
  | "available"
  | "pending_coverage"
  | "covered"
  | "manager_approved"
  | "denied"
  | "cancelled";

/**
 * A shift that has been dropped onto the exchange board. References
 * the underlying `Shift` document so the source of truth for
 * start / end / station stays a single place.
 *
 * The denormalised display fields (`droppedByName`, `start`, `end`,
 * `station`) make the mobile feed cheap to render without an extra
 * join. They are rewritten if the originating Shift is updated.
 */
export interface ExchangeShiftDTO {
  id: string;
  orgId: string;
  locationId: string;
  /** Source `Shift.id` whose ownership flips when picked up. */
  shiftId: string;
  /** Source `Schedule.id` — denormalised to keep weekly views snappy. */
  scheduleId: string;
  /** `Staff.id` of the person dropping the shift. */
  staffId: string;
  /** `Staff.name` snapshot at drop time (read-only display field). */
  droppedByName: string;
  /** `Staff.id` of the picker once status moves past `available`. */
  pickedUpByStaffId?: string | null;
  /** `Staff.name` snapshot of the picker, for display in "my drops". */
  pickedUpByName?: string | null;
  start: Date;
  end: Date;
  station: string;
  status: ExchangeShiftStatus;
  /** Optional note from the dropper (max ~500 chars). */
  reason: string;
  /**
   * Clerk user id of the manager / shift lead who issued the most
   * recent decision (approval or denial). Set when transitioning to
   * `manager_approved` or `denied`.
   */
  approvedByClerkUserId?: string | null;
  /** Timestamp of that decision. */
  approvedAt?: Date | null;
  /** Optional manager note attached to a denial (or future approval). */
  managerNotes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Extra context the manager dashboard surfaces when reviewing a
 * pending exchange. Computed on demand from current Staff + Shift
 * state, never persisted. All fields describe the *picker's* world
 * after the shift would be reassigned (the dropper just loses the
 * shift's hours, which is reflected in `dropperHoursAfter`).
 */
export interface ExchangeShiftViabilityDTO {
  /** Hours the dropper would have left this week after the swap. */
  dropperHoursBefore: number;
  dropperHoursAfter: number;
  /** Hours the picker would land on this week after the swap. */
  pickerHoursBefore: number;
  pickerHoursAfter: number;
  /** Hours-per-week ceiling on each side (from Staff). */
  dropperMaxHoursPerWeek: number;
  pickerMaxHoursPerWeek: number;
  /** Picker's max-hours overage caused by accepting this shift. */
  pickerOvertime: boolean;
  /** Picker has at least one skill matching the shift's station. */
  pickerHasSkill: boolean;
  /** Best skill proficiency (1-5) the picker holds for the station, if any. */
  pickerStationProficiency: number | null;
  /**
   * Picker shares at least one role with the dropper. Heuristic for
   * "this is a like-for-like swap"; does not block the swap.
   */
  pickerHasMatchingRole: boolean;
  pickerRoles: string[];
  dropperRoles: string[];
  /** Picker has an existing shift overlapping the swap window. */
  pickerHasOverlap: boolean;
  /**
   * Number of hours between the picker's previous shift end and the
   * swapped shift start (or between swapped shift end and next
   * picker shift start), whichever is smaller. `null` when no
   * adjacent shift exists.
   */
  pickerMinTurnaroundHours: number | null;
  /** True when the smallest adjacent gap is below the clopen threshold. */
  pickerClopenRisk: boolean;
  clopenThresholdHours: number;
  /** Picker's remaining shifts in the week (not counting the swap). */
  pickerOtherShiftsThisWeek: number;
  /** Active flag for both staff. Inactive staff are unusual but possible. */
  pickerIsActive: boolean;
  dropperIsActive: boolean;
  /** Names denormalised for client-side rendering. */
  dropperName: string;
  pickerName: string | null;
}

// ── Skill Change Request ─────────────────────────────────────

export {
  skillChangeTypeValues,
  skillChangeStatusValues,
  skillChangeTypeSchema,
  skillChangeStatusSchema,
  submitSkillAdditionSchema,
  submitSkillRemovalSchema,
  reviewSkillChangeSchema,
  reviewSkillChangesBatchSchema,
  listSkillChangeRequestsSchema,
} from "./validations/skill-change-request.schema";

export type {
  SkillChangeType,
  SkillChangeStatus,
  SubmitSkillAdditionInput,
  SubmitSkillRemovalInput,
  ReviewSkillChangeInput,
  ReviewSkillChangesBatchInput,
  ListSkillChangeRequestsInput,
} from "./validations/skill-change-request.schema";

/**
 * A staff member's proposal to add or remove one of their station
 * skills. Both directions require manager approval before they touch
 * `Staff.skills`; see `skill-change-request.schema.ts` for the
 * lifecycle. `proficiency` is the staff-proposed level for an `add`
 * request and a snapshot of the current level for a `remove` request.
 */
export interface SkillChangeRequestDTO {
  id: string;
  orgId: string;
  locationId: string;
  staffId: string;
  /** `Staff.name` snapshot so manager lists render without a join. */
  staffName: string;
  /** Clerk user id of the staff member who submitted the request. */
  clerkUserId: string;
  type: import("./validations/skill-change-request.schema").SkillChangeType;
  station: string;
  proficiency: 1 | 2 | 3 | 4 | 5;
  /** Required for `remove`; empty string for `add`. */
  reason: string;
  status: import("./validations/skill-change-request.schema").SkillChangeStatus;
  /** Clerk user id of the manager who issued the decision. */
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  /** Optional manager note attached to the decision. */
  reviewNotes: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Notifications ────────────────────────────────────────────

import type {
  NotificationCategory,
  NotificationCategoriesPrefs,
  QuietHoursPrefs,
} from "./validations/notification.schema";

import type {
  WebNotificationCategory,
  WebNotificationCategoriesPrefs,
} from "./validations/web-notification.schema";

export type {
  NotificationCategory,
  NotificationChannel,
  NotificationCategoriesPrefs,
  QuietHoursPrefs,
  CategoryChannelPrefs,
  UpdateNotificationPreferencesInput,
  RegisterDeviceTokenInput,
} from "./validations/notification.schema";

export {
  notificationCategoryValues,
  notificationChannelValues,
  updateNotificationPreferencesSchema,
  registerDeviceTokenSchema,
  quietHoursSchema,
} from "./validations/notification.schema";

export type {
  WebNotificationCategory,
  WebNotificationCategoriesPrefs,
  UpdateWebNotificationPreferencesInput,
} from "./validations/web-notification.schema";

export {
  webNotificationCategoryValues,
  updateWebNotificationPreferencesSchema,
} from "./validations/web-notification.schema";

/**
 * A user's notification preferences across all channels and
 * categories. Stored once per Clerk user (no `orgId` / `locationId`
 * scoping — see the `NotificationPreference` doc comment in
 * `apps/web/src/server/models/NotificationPreference.ts` for the
 * rationale).
 */
export interface NotificationPreferencesDTO {
  /** Clerk user id this row belongs to. */
  clerkUserId: string;
  /** Master switches; an `off` here disables every category on that channel. */
  channels: { push: boolean; email: boolean };
  /** Per-category, per-channel matrix. Every category key is always present. */
  categories: NotificationCategoriesPrefs;
  /** Optional quiet-hours window. `null` means quiet hours are disabled. */
  quietHours: QuietHoursPrefs;
  updatedAt: Date;
}

/**
 * One row per registered device that wants to receive Expo Push
 * notifications. Soft-deleted via `revokedAt` rather than hard-deleted
 * so the dispatcher can correlate "this token is dead now" with the
 * user it belonged to in logs.
 */
export interface DeviceTokenDTO {
  id: string;
  clerkUserId: string;
  /** Expo push token (`ExponentPushToken[…]`). */
  expoPushToken: string;
  platform: "ios" | "android";
  deviceName?: string | null;
  /** Last time the client refreshed this token (used for prune jobs later). */
  lastSeenAt: Date;
  /** Set when Expo returns `DeviceNotRegistered` or the user signs out. */
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Default preferences used when a user reads `GET
 * /api/me/notifications/preferences` for the first time. Every
 * category opts in on both channels; users opt out from the mobile
 * settings screen.
 */
export function defaultNotificationPreferences(
  clerkUserId: string,
): Omit<NotificationPreferencesDTO, "updatedAt"> {
  const categories = {} as NotificationCategoriesPrefs;
  for (const cat of [
    "schedule_published",
    "schedule_unpublished",
    "shift_assignment_changed",
    "manager_coverage_gap",
    "time_off_submitted",
    "time_off_decision",
    "exchange_new_drop",
    "exchange_pending_approval",
    "exchange_decision",
    "skill_change_submitted",
    "skill_change_decision",
    "announcements",
    "schedule_generation_async",
    "billing_alerts",
  ] as const satisfies readonly NotificationCategory[]) {
    categories[cat] = { push: true, email: true };
  }
  return {
    clerkUserId,
    channels: { push: true, email: true },
    categories,
    quietHours: null,
  };
}

/**
 * Web manager/owner notification preferences. Stored once per Clerk
 * user, **separately** from the mobile {@link NotificationPreferencesDTO}
 * (different collection, different category set). Web only delivers
 * email, so there is a single master `email` switch plus a per-category
 * email toggle for the manager/owner-facing categories.
 */
export interface WebNotificationPreferencesDTO {
  /** Clerk user id this row belongs to. */
  clerkUserId: string;
  /** Master web-email switch; `off` disables every web category email. */
  email: boolean;
  /** Per-category email toggle. Every web category key is always present. */
  categories: WebNotificationCategoriesPrefs;
  updatedAt: Date;
}

/**
 * Default web preferences used the first time a manager opens the web
 * notification settings page. Every web category opts in; users opt out
 * from the dashboard settings screen.
 */
export function defaultWebNotificationPreferences(
  clerkUserId: string,
): Omit<WebNotificationPreferencesDTO, "updatedAt"> {
  const categories = {} as WebNotificationCategoriesPrefs;
  for (const cat of [
    "time_off_submitted",
    "exchange_pending_approval",
    "manager_coverage_gap",
    "skill_change_submitted",
    "schedule_generation_async",
    "billing_alerts",
  ] as const satisfies readonly WebNotificationCategory[]) {
    categories[cat] = true;
  }
  return {
    clerkUserId,
    email: true,
    categories,
  };
}

// ── Candidate (Schedule Generation) ──────────────────────────

export interface SlotCandidates {
  dayOfWeek: number;
  station: string;
  startTime: string;
  endTime: string;
  priority: LaborPriority;
  minStaff: number;
  preferredStaff: number;
  candidates: CandidateInfo[];
}

export interface CandidateInfo {
  staffId: string;
  staffName: string;
  roles: string[];
  skillProficiency: number;
  availabilityPreference: AvailabilityPreference;
  currentWeekHours: number;
  maxHoursPerWeek: number;
  minHoursPerWeek: number;
  isPreferredStation: boolean;
  hasTimeOff: boolean;
}
