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
  clerkUserId?: string | null;
  invitationStatus: InvitationStatus;
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
}

export interface UpdateOrganizationInput {
  name?: string;
}

// ── Organization Member ──────────────────────────────────────

export type MemberRole = "owner" | "manager" | "shift_lead" | "staff";

export interface OrganizationMemberDTO {
  id: string;
  orgId: string;
  locationId: string | null;
  clerkUserId: string;
  role: MemberRole;
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
}

export interface SaveKitchenConfigOptions {
  roleReplacement?: {
    oldRole: string;
    newRole: string;
  };
}

// ── Announcement ─────────────────────────────────────────────

/**
 * Priority bucket for an announcement. Drives presentation on the
 * mobile home tab (urgent → red banner, high → amber, etc.) and
 * sorting (urgent / high pin to the top within the recency window).
 */
export type AnnouncementPriority = "urgent" | "high" | "normal" | "low";

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
  authorClerkUserId: string;
  /** Display name captured at write time so deletions don't break the feed. */
  authorName: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  /** Optional expiry — when set, expired announcements are filtered out. */
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

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
