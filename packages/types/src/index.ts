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

export interface TimeOffRequestDTO {
  id: string;
  orgId: string;
  locationId: string;
  staffId: string;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: TimeOffRequestStatus;
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
 * - `pending_coverage`  Another staff member has clicked "pick up" and
 *                       the system is waiting on shift-lead /
 *                       manager approval (only when KitchenConfig
 *                       requires it).
 * - `covered`           A pickup was accepted automatically (no
 *                       approval required) or after manager sign-off.
 *                       The underlying Shift's `staffId` has been
 *                       reassigned by `ExchangeShiftService.pickup`.
 * - `manager_approved`  Terminal historical status used when the
 *                       coverage flow involved manager approval. Kept
 *                       distinct from `covered` so the audit trail can
 *                       distinguish the two paths.
 * - `cancelled`         The dropper rescinded the drop before it was
 *                       picked up. Terminal.
 */
export type ExchangeShiftStatus =
  | "available"
  | "pending_coverage"
  | "covered"
  | "manager_approved"
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
  /** Set by manager / shift lead when transitioning to `manager_approved`. */
  approvedByClerkUserId?: string | null;
  approvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
