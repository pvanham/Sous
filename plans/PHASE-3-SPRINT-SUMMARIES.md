Phase 3 Sprint Completion Summaries

Below is a list of summaries provided by coding agents upon the completion of each sprint in Phase 3 of the Master Roadmap

Sprint 3.1 implementation is complete. Here's a summary of what was created:
Files Created (5 files following the 3-layer architecture):
src/types/labor-requirement.ts - Types and DTO converter
LaborPriority type (critical | high | normal | low)
ILaborRequirement interface for Mongoose documents
LaborRequirementDTO for clean UI consumption
toLaborRequirementDTO() converter function
src/lib/validations/labor-requirement.schema.ts - Zod validation schemas
laborRequirementSchema - main create schema with time format validation, day range (0-6), and refinements for endTime > startTime and preferredStaff >= minStaff
laborRequirementUpdateSchema - partial update schema
dayOfWeekSchema - for querying by day
Helper constants like DAY_NAMES and getDayName()
src/server/models/LaborRequirement.ts - Mongoose model
Schema with orgId, locationId, dayOfWeek, station, startTime, endTime, minStaff, preferredStaff, priority
Compound index on (orgId, locationId, dayOfWeek, station) for efficient queries
Unique constraint on (orgId, locationId, dayOfWeek, station, startTime) to prevent duplicates
Pre-save validation for time and staff count rules
src/server/services/labor-requirement.service.ts - Service layer
list(), getByDayOfWeek(), getById(), create(), update(), upsert(), delete()
Additional helpers: getByStation(), count(), deleteAllByLocation(), deleteAllByOrgId()
All methods use orgId + locationId scoping per Phase 2.5
src/server/actions/labor-requirement.actions.ts - Server actions
listLaborRequirements(), getLaborRequirementsByDay(), getLaborRequirementById()
createLaborRequirement(), updateLaborRequirement(), upsertLaborRequirement(), deleteLaborRequirement()
All actions include auth checks, Zod validation, station validation against KitchenConfig, and proper error handling

Sprint 3.2 Labor Requirements UI has been implemented successfully. Here's a summary of what was created:
Files Created/Updated

1. Navigation Update
   src/app/(dashboard)/dashboard/layout.tsx/dashboard/layout.tsx)
   Added "Labor" navigation item with ClipboardList icon from lucide-react
2. Labor Page (Server Component)
   src/app/(dashboard)/dashboard/labor/page.tsx/dashboard/labor/page.tsx)
   Server component that fetches initial data via listLaborRequirements() and getKitchenConfig()
   Renders header with title "Labor Requirements"
   Shows empty state with link to Settings if no stations configured
   Passes initial data to LaborGrid component
3. LaborGrid Component (Client Component)
   src/app/(dashboard)/dashboard/labor/\_components/LaborGrid.tsx/dashboard/labor/components/LaborGrid.tsx)

- CSS Grid layout with stations as rows, days (Mon-Sun) as columns
  TanStack Query for data fetching with laborRequirementKeys pattern
  Groups requirements by station + dayOfWeek for efficient cell rendering
  Summary row showing total person-hours per day
  Dialog state management for create/edit operations

4. RequirementCell Component
   src/app/(dashboard)/dashboard/labor/\_components/RequirementCell.tsx/dashboard/labor/components/RequirementCell.tsx)

- Displays requirements for a station/day cell
  Priority color coding via left border (critical=red, high=orange, normal=slate, low=light slate)
  Shows staff count and time range in compact format (e.g., "2 staff, 9a-5p")
  "+" button to add requirements to empty cells
  Click handlers to open form dialog

5. RequirementFormDialog Component
   src/app/(dashboard)/dashboard/labor/\_components/RequirementFormDialog.tsx/dashboard/labor/components/RequirementFormDialog.tsx)

- Full CRUD form with react-hook-form and Zod validation
  Fields: Day of Week, Station, Start/End Time, Min/Preferred Staff, Priority
  Create, Update, and Delete mutations with TanStack Query
  Toast notifications via sonner
  Form reset on open/close following existing patterns
  Architecture Compliance
  All code follows the 3-layer architecture from ARCHITECTURE.md:
  UI Layer: Components only call Server Actions
  Actions Layer: Uses existing Sprint 3.1 actions (labor-requirement.actions.ts)
  Service Layer: No changes needed (Sprint 3.1 complete)
  The implementation uses:
  TanStack Query v5 for data fetching and caching
  shadcn/ui components (Dialog, Form, Select, Input, Button)
  Multi-tenancy via getLocationContext() in actions
  Zod schemas from labor-requirement.schema.ts

Sprint 3.3 implementation is complete. Here's a summary of what was implemented:
Summary of Sprint 3.3: Staff Availability & Constraints Model
Part 1: Staff Model Extensions (Updated Files)
src/server/models/Staff.ts
Added maxHoursPerWeek (default: 40)
Added minHoursPerWeek (default: 0)
Added preferredStations (string array)
Added certifications (string array)
Added hourlyRate (default: 0)
Added pre-save validation for maxHoursPerWeek >= minHoursPerWeek
src/types/staff.ts
Updated IStaff interface with new fields
Updated StaffDTO interface with new fields
Updated toStaffDTO() converter
src/lib/validations/staff.schema.ts
Added Zod validation for new optional fields with defaults
Added refinement to validate maxHoursPerWeek >= minHoursPerWeek
Updated StaffFormValues and defaultStaffValues
src/server/services/staff.service.ts
Updated create() method to handle new fields
Updated update() method to handle new fields
Updated bulkUpsert() method to handle new fields
Part 2: StaffAvailability Model (New Files)
src/server/models/StaffAvailability.ts (new)
Schema with orgId, locationId, staffId, dayOfWeek, availableFrom, availableTo, preference, notes
Unique compound index on (orgId, locationId, staffId, dayOfWeek)
Query optimization index on (orgId, locationId, dayOfWeek)
Pre-save validation for time range
src/types/staff-availability.ts (new)
AvailabilityPreference type
IStaffAvailability interface
StaffAvailabilityDTO interface
toStaffAvailabilityDTO() converter
src/lib/validations/staff-availability.schema.ts (new)
staffAvailabilitySchema for single entries
bulkAvailabilitySchema for weekly updates
availableStaffQuerySchema for querying available staff
src/server/services/staff-availability.service.ts (new)
list(), getByStaffId(), getByDayOfWeek()
getAvailableStaff() - Key method for CandidateService (Sprint 3.5)
upsert(), bulkUpsert()
delete(), deleteByStaffId(), deleteAllByLocation()
src/server/actions/staff-availability.actions.ts (new)
listStaffAvailability(), getStaffAvailability()
getAvailabilityByDay(), getAvailableStaffForSlot()
upsertStaffAvailability(), bulkUpdateAvailability()
deleteStaffAvailability(), deleteAllStaffAvailability()
Additional Fix
Fixed pre-save hooks in LaborRequirement.ts to use Mongoose 9 pattern (throwing errors instead of callback)
All files follow the 3-layer architecture pattern and are ready for Sprint 3.4 (Staff Availability UI) and Sprint 3.5 (CandidateService).

Sprint 3.4 implementation is complete. Here's a summary of what was implemented:
Summary of Sprint 3.4: Staff Availability UI
Files Created

1. Availability Page (Server Component)
   src/app/(dashboard)/dashboard/staff/[id]/availability/page.tsx
   - Server component that fetches staff, availability, and kitchen config in parallel
   - Handles 404 if staff not found via notFound()
   - Renders back navigation and passes data to AvailabilityGrid

2. AvailabilityGrid Component (Client Component)
   src/app/(dashboard)/dashboard/staff/[id]/availability/\_components/AvailabilityGrid.tsx
   - Weekly grid with 7 columns (Sun-Sat) and 3 rows (Morning/Afternoon/Evening)
   - Time periods: 6a-12p, 12p-6p, 6p-12a mapped to availableFrom/To format
   - Local state tracking for slot preferences with unsaved changes detection
   - Click-to-toggle cycles: unavailable → available → preferred → unavailable
   - Save button calls bulkUpdateAvailability action
   - Discard button resets to initial state
   - TanStack Query for mutations with toast notifications
   - Legend showing color coding for preference states

3. AvailabilitySlot Component
   src/app/(dashboard)/dashboard/staff/[id]/availability/\_components/AvailabilitySlot.tsx
   - Individual cell component for the grid
   - Visual states: green (preferred), blue (available), gray (unavailable)
   - Icons: ★ preferred, ✓ available, ✗ unavailable
   - Hover effects with scale and shadow
   - Focus ring for keyboard navigation

4. StaffConstraintsForm Component
   src/app/(dashboard)/dashboard/staff/[id]/availability/\_components/StaffConstraintsForm.tsx
   - Form for updating Staff model fields: maxHoursPerWeek, minHoursPerWeek, hourlyRate, preferredStations
   - Uses react-hook-form with Zod validation
   - Multi-select for preferred stations via badges with remove buttons
   - Calls updateStaff action on save
   - Dirty state tracking for save button enable/disable

Files Updated

1. src/server/actions/staff.actions.ts
   - Added getStaffById() action to fetch a single staff member by ID
   - Follows existing action patterns with auth checks and location context

2. src/app/(dashboard)/dashboard/staff/\_components/StaffTable.tsx
   - Added Calendar icon import from lucide-react
   - Added Link import from next/link
   - Added availability button in actions column linking to /dashboard/staff/[id]/availability

Additonal Sprint 3.4 Changes

Labor Requirements Improvemnets

Phase 1: Allow Zero Staff + Overlap Validation
Modified Files:
src/server/models/LaborRequirement.ts - Changed min: 1 to min: 0 for minStaff and preferredStaff
src/lib/validations/labor-requirement.schema.ts - Updated both schemas to allow 0 for staff fields, added bulk operation schemas (bulkCellSchema, bulkCreateSchema)
src/lib/utils/time-overlap.ts (NEW) - Created utility functions timeRangesOverlap() and findOverlappingRequirement() for overlap detection
src/server/services/labor-requirement.service.ts - Added:
Import for findOverlappingRequirement
Import for LaborPriority type
getByStationAndDay() helper method
Overlap validation in create() method
Overlap validation in update() method
bulkCreate() method for bulk operations
src/server/actions/labor-requirement.actions.ts - Added bulkCreateLaborRequirements() action following the .cursorrules pattern
Phase 2: UI Updates for Zero Staff
src/app/(dashboard)/dashboard/labor/\_components/RequirementFormDialog.tsx - Changed min={1} to min={0} on staff inputs
src/app/(dashboard)/dashboard/labor/\_components/RequirementCell.tsx - Added:
Muted styling for zero-staff requirements
"Closed" text display
Bulk edit mode props (bulkEditMode, isSelected, onToggleSelect)
Checkbox rendering in bulk edit mode
Selection ring visual feedback
Phase 3: Bulk Edit Feature
src/app/(dashboard)/dashboard/labor/\_components/BulkEditToolbar.tsx (NEW) - Toolbar component with:
Toggle button for bulk edit mode
Select All / Clear Selection buttons
Apply to Selected button
Selected count display
src/app/(dashboard)/dashboard/labor/\_components/BulkRequirementFormDialog.tsx (NEW) - Bulk form dialog with:
TanStack Query mutation
Form for time range, staff counts, priority
Selected cells summary
Toast notifications
src/app/(dashboard)/dashboard/labor/\_components/LaborGrid.tsx - Added:
Bulk edit mode state
Cell selection state (Set-based for efficient lookups)
Selection handlers (toggle, select all, clear)
Integration with BulkEditToolbar and BulkRequirementFormDialog

Labor Grid Improvements
Feature 1: Bulk deletion + toolbar
Service (labor-requirement.service.ts): Added bulkDelete(orgId, locationId, cells) that runs deleteMany per cell and returns { deleted: number }.
Schema (labor-requirement.schema.ts): Added bulkDeleteSchema and BulkDeleteInput using bulkCellSchema.
Action (labor-requirement.actions.ts): Added bulkDeleteLaborRequirements with auth, validation, getLocationContext(), and service call.
BulkEditToolbar: Added onDelete prop; Select All and Clear use variant="outline"; added separator and “Delete Selected” (destructive); label “Apply to Selected” → “Add to Selected”.
BulkDeleteConfirmDialog (new): Confirm dialog with “Delete Requirements” title and description; uses useMutation for bulkDeleteLaborRequirements, toasts on success/error, invalidates laborRequirementKeys.list() on success.
LaborGrid: deleteDialogOpen state, handleBulkDelete / handleDeleteDialogClose / handleDeleteSuccess, onDelete passed to toolbar, and BulkDeleteConfirmDialog rendered with selectedCellsArray and onSuccess to clear selection and exit bulk mode.
Feature 2: Stretchy labels
RequirementCell: Container has h-full; each requirement button has flex-1 min-h-0 so labels share vertical space; “add more” button is unchanged at the bottom.
Feature 3: Weekly total + tooltip
LaborGrid: weeklyTotal from totalHoursByDay; “Total Hours” wrapped in shadcn Tooltip with Info icon and explanation (preferred staff × duration = person-hours); new “Weekly Total” row showing weeklyTotal.toFixed(1)} person-hours (or “-” when 0) in a col-span-7 cell.
Other
Added shadcn tooltip component (src/components/ui/tooltip.tsx) for the Total Hours tooltip.

Sprint 3.4a: Time-Off Requests Model -- Complete
5 files created, strictly following the 3-layer architecture per ARCHITECTURE.md and .cursorrules:
src/types/time-off-request.ts -- Types and DTO converter
TimeOffRequestStatus type (pending | approved | denied)
ITimeOffRequest interface for Mongoose documents
TimeOffRequestDTO for clean UI consumption
toTimeOffRequestDTO() converter function
src/lib/validations/time-off-request.schema.ts -- Zod validation schemas (Zod v4 compatible)
createTimeOffRequestSchema with .refine() for endDate >= startDate
updateTimeOffStatusSchema restricted to approved/denied only
timeOffByStaffSchema, timeOffByDateRangeSchema, approvedTimeOffQuerySchema for queries
All inferred types exported
src/server/models/TimeOffRequest.ts -- Mongoose model
Schema with orgId + locationId multi-tenancy scoping (not userId)
3 compound indexes for staff+status, date range, and duplicate prevention
Pre-save validation for date range consistency
Singleton export for Next.js HMR compatibility
src/server/services/time-off-request.service.ts -- Service layer (ONLY place model is imported)
list(), getById(), getByStaffId(), getByDateRange(), create(), updateStatus(), delete()
getApprovedTimeOff() -- Key method for Sprint 3.5 CandidateService, uses overlap logic
hasApprovedTimeOff() -- Boolean convenience for single-date checks
Delete restricted to pending requests only (audit trail preservation)
Cleanup methods for testing
src/server/actions/time-off-request.actions.ts -- Server actions
All 7 actions follow: auth() -> Zod safeParse() -> getLocationContext(userId) -> Service call -> ActionResponse<T>
updateTimeOffRequestStatus() passes Clerk userId as reviewedBy for audit trail
deleteTimeOffRequest() communicates that only pending requests can be deleted

Sprint 3.4b: Time-Off Requests UI & Approval -- Complete
4 new files created, 2 existing files updated, all strictly following the 3-layer architecture per ARCHITECTURE.md and .cursorrules (UI Layer calls Server Actions only, no DB imports):
New Files:
src/app/(dashboard)/dashboard/time-off/page.tsx -- Server component
Fetches listTimeOffRequests() and listStaff() in parallel via Promise.all
Passes initial data to the client TimeOffRequestTable component
src/app/(dashboard)/dashboard/time-off/\_components/TimeOffRequestTable.tsx -- Main client component
Exported timeOffRequestKeys query key factory for child components
TanStack Query useQuery with initialData from server
Status filter tabs (All / Pending / Approved / Denied) using shadcn Tabs
@tanstack/react-table with columns: Staff Name (resolved via Map), Start/End Date (formatted with date-fns), Reason, Status (color-coded Badge), Reviewed info, Actions
URL-based ?staffId= filtering (from StaffTable link)
Delete mutation with AlertDialog confirmation
Opens TimeOffRequestReviewDialog and CreateTimeOffRequestDialog
src/app/(dashboard)/dashboard/time-off/\_components/TimeOffRequestReviewDialog.tsx -- Review dialog
Displays request details (staff name, dates, reason, submitted date)
Approve/Deny buttons with separate useMutation calls to updateTimeOffRequestStatus
Optional manager notes input
Toast notifications and query invalidation on success
src/app/(dashboard)/dashboard/time-off/\_components/CreateTimeOffRequestDialog.tsx -- Create dialog
react-hook-form + zodResolver(createTimeOffRequestSchema) for Zod v4 validation
Staff member Select dropdown (active staff only)
Native date inputs (<Input type="date">) for start/end dates
Optional reason field
useMutation calling createTimeOffRequest action
Updated Files:
src/app/(dashboard)/dashboard/layout.tsx -- Added "Time Off" nav item with CalendarOff icon, placed before Settings
src/app/(dashboard)/dashboard/staff/\_components/StaffTable.tsx -- Added CalendarOff "Time Off" action button per row, linking to /dashboard/time-off?staffId={id}

Sprint 3.5: Candidate Filter Service (Hard Filter Layer) -- Complete
Files Created (2 files, strictly following the 3-layer architecture per ARCHITECTURE.md and .cursorrules):
src/types/candidate.ts -- Types and DTOs
CandidateDTO interface -- represents a valid candidate for a slot, with staffId, staffName, skills, preference (preferred/available), currentWeekHours, maxHoursPerWeek, overtimeWarning, preferredStations, and optional notes
SlotDefinition interface -- extracted slot shape from LaborRequirementDTO (station, times, staffing targets, priority)
SlotCandidates interface -- groups candidates per slot with hasSufficientCandidates boolean
Pure output types only -- no Mongoose model or toDTO() converter needed
src/server/services/candidate.service.ts -- Service Implementation
6 internal pure filter functions:
filterByAvailability() -- cross-references staff against StaffAvailabilityDTO[], returns preference map
filterByTimeOff() -- removes staff with approved time-off on the target date
filterBySkills() -- keeps only staff with a skill matching the required station
filterByExistingShifts() -- removes staff with overlapping shifts (Date-based overlap detection)
calculateWeekHours() -- sums hours from existing shifts per staff member for the week
getSlotDurationHours() -- converts HH:MM time strings to duration in hours
3 public methods on CandidateService:
getCandidatesForSlot(orgId, locationId, date, startTime, endTime, station, existingShifts) -- full filter pipeline for a single slot. Fetches staff + availability in parallel, then applies all 4 hard filters, calculates week hours and overtime flags, returns sorted CandidateDTO[]
getCandidatesForDay(orgId, locationId, date, laborRequirements, existingShifts) -- batched data fetching (staff, availability, time-off, week hours) done ONCE, then per-slot pure filtering to avoid N+1 query patterns. Returns SlotCandidates[]
wouldCauseOvertime(staffId, proposedShift, existingShifts, maxHours) -- synchronous utility to check if a proposed shift would exceed max hours
Sorting: Candidates are sorted by preference (preferred first), then proficiency for the target station (highest first), then non-overtime before overtime, then alphabetical as tiebreaker
Architecture compliance: Does NOT import any Mongoose models directly. Calls StaffService, StaffAvailabilityService, and TimeOffRequestService for data, then applies pure functions. Uses (orgId, locationId) scoping. Returns plain DTOs.

Sprint 3.6 Complete -- OpenAI Client & AI Cost Tracking
Files Created (5)
File Purpose
src/lib/ai/openai-client.ts OpenAI client wrapper with generateCompletion(), generateJSON<T>(), retry logic, token usage tracking, limit enforcement, and typed error classes (AILimitExceededError, AIServiceUnavailableError)
src/server/models/AIUsageLog.ts Mongoose model with orgId/locationId multi-tenancy, token counts, cost estimation, duration, success/error tracking, and compound indexes
src/types/ai-usage.ts AIUsageLogDTO, TokenUsage, UsageSummary, GenerationCheckResult, AIUsageLogInput types, and toAIUsageLogDTO() converter
src/server/services/ai-usage.service.ts Service layer with logUsage(), getMonthlyUsage() (MongoDB aggregation), canGenerate() (limit enforcement), getUsageHistory(), and deleteAllByLocation()
scripts/test-sprint-3.6.ts End-to-end verification script (61 tests, 56 pass, 5 skipped without API key)
Files Updated (6)
File Change
src/server/models/KitchenConfig.ts Added IAISettings interface and aiSettings embedded subdocument with defaults
src/types/kitchen-config.ts Added AISettingsDTO, updated KitchenConfigDTO and toKitchenConfigDTO() with fallback defaults for legacy docs
src/lib/validations/kitchen-config.schema.ts Added aiSettingsSchema (Zod) and integrated as optional with defaults in kitchenConfigSchema
src/server/services/kitchen-config.service.ts Updated upsert() to persist aiSettings when provided
src/app/(dashboard)/dashboard/settings/\_components/KitchenConfigForm.tsx Added aiSettings to form default values
scripts/seed-candidate-test.ts Added aiSettings to test kitchen config
package.json Added openai, ai deps and test:sprint-3.6 script
Architecture Notes
Strict 3-layer architecture maintained: AIUsageLog model only imported in ai-usage.service.ts
AIUsageService.canGenerate() reads limits via KitchenConfigService.getByLocation() (no cross-layer model imports)
All DTOs are plain objects -- no Mongoose documents leak
modelName field used instead of model to avoid Mongoose Document property conflict
Timezone stays on Location model (not duplicated on KitchenConfig per architectural note in plan)
Typed error classes (AILimitExceededError, AIServiceUnavailableError) ready for Sprint 3.7's fallback handling

Sprint 3.7 is fully implemented and verified. Here's a summary of what was created:
Files Created (4)
File Purpose
src/types/ai-scheduling.ts Type system: SchedulingContext, DaySchedulingContext, AIRawDayOutput, GeneratedShiftAssignment, GeneratedDaySchedule, GeneratedSchedule, UnfilledSlot, GenerationMetadata
src/server/services/ai/prompts/schedule-generation.ts Prompt templates: buildSystemPrompt(), buildDayUserPrompt(), buildCorrectionPrompt() (stub for Sprint 3.8)
src/server/services/ai/scheduling-agent.service.ts Main service: SchedulingAgentService with buildSchedulingContext(), generateDaySchedule(), generateWeekSchedule(), and internal algorithmicFallback()
scripts/test-sprint-3.7.ts End-to-end verification (57 tests, 56 passed, 1 skipped)
Files Updated (1)
File Change
package.json Added test:sprint-3.7 script
Architecture Compliance
3-Layer Architecture: SchedulingAgentService lives in the Service Layer, calls other services (CandidateService, KitchenConfigService, StaffService, etc.), and never imports Mongoose models directly.
DTO-only returns: All outputs are plain TypeScript objects -- no Mongoose documents leak.
Multi-tenancy: All data access scoped by (orgId, locationId) per ARCHITECTURE.md.
No any types: Strict TypeScript throughout.
File naming: kebab-case.service.ts for services, kebab-case.ts for types.
Key Design Highlights
Day-by-day sequential generation with shift accumulation across days prevents double-booking
Clopening detection passes previous day's closing shifts to the AI prompt
Algorithmic fallback automatically activates when AILimitExceededError or AIServiceUnavailableError is caught, using CandidateService's pre-sorted candidates
Token tracking passes tracking options on every generateJSON call for Sprint 3.6's usage logging and limit enforcement
buildCorrectionPrompt() is stubbed and ready for Sprint 3.8's self-correction loop

Sprint 3.8: Schedule Validator Service (Validator Layer) -- Complete

Files Created (2)
File | Purpose
src/server/services/schedule-validator.service.ts | Deterministic validation of AI-generated schedules against hard constraints, with self-correction retry loop (retryWithCorrections) and graceful degradation (stripInvalidAssignments)
src/lib/validations/generated-schedule.schema.ts | Zod schemas for structural validation of AI output: generatedShiftAssignmentSchema, unfilledSlotSchema, generatedDayScheduleSchema
scripts/test-sprint-3.8.ts | End-to-end verification script (52 tests, 52 passed, 0 skipped)

Files Updated (3)
File | Change
src/types/ai-scheduling.ts | Added ValidationError, ValidationWarning, ValidationResult, ValidationErrorType, ValidationWarningType interfaces; added warnings field to GeneratedSchedule; updated header comment
src/server/services/ai/scheduling-agent.service.ts | Integrated validation + retry loop into generateDaySchedule(); exported normalizeAIOutput(); added allStaff parameter; updated generateWeekSchedule() to pass staff and accumulate warnings; added ScheduleValidatorService import
package.json | Added test:sprint-3.8 script

Architecture Compliance
3-Layer Architecture: ScheduleValidatorService lives in the Service Layer. It does NOT import Mongoose models directly -- all validation operates on DTOs (GeneratedDaySchedule, StaffDTO, ShiftDTO, SlotCandidates).
DTO-only: All inputs and outputs are plain TypeScript objects. No Mongoose documents leak.
Multi-tenancy: Validation context includes orgId/locationId scoping via DaySchedulingContext and SchedulingContext.
No any types: Strict TypeScript 5 throughout.
File naming: kebab-case per .cursorrules (schedule-validator.service.ts, generated-schedule.schema.ts).
Zod-first validation: New schema in src/lib/validations/ follows existing Zod patterns (timeStringSchema reuse, z.infer exports).
Service Object Pattern: ScheduleValidatorService uses the same object-with-methods pattern as all other services.

Validation Checks Implemented
Hard Errors (block schedule):

- invalid_staff_id: staffId not in any slot's candidate list
- double_booking: same staffId assigned to overlapping shifts same day (uses timeRangesOverlap from src/lib/utils/time-overlap.ts)
- unavailable_staff: staffId not in the SPECIFIC slot's candidate list
- max_hours_exceeded: weekly hours (existing + all proposed) exceed maxHoursPerWeek
- skill_mismatch: staff lacks a skill entry for the assigned station
- overlap: assignment overlaps with an already-existing shift

Soft Warnings (surfaced to user):

- overtime_risk: staff above 80% of maxHoursPerWeek
- non_preferred_station: assigned to a station not in preferredStations
- clopening_risk: gap between previous day close and current day open < 10 hours

Key Design Highlights
Day-level validation: Runs per-day inside the existing sequential generation loop, so corrections happen before the next day's candidates are computed
Self-correction loop: Up to 3 retry attempts using buildCorrectionPrompt() (Sprint 3.7 stub now active). Each ValidationError includes a correctionHint fed back to the AI.
Graceful degradation: On max retries exhausted, stripInvalidAssignments() removes errored assignments instead of throwing -- a partial schedule is better than none
Pure logic validator: ScheduleValidatorService.validate() makes zero DB calls. All data comes via DaySchedulingContext and StaffDTO[]. This makes it fast and unit-testable.
Algorithmic fallback also validated: The fallback path runs through validation too, capturing warnings (should always be clean since the fallback has its own overlap checks)
Token tracking: Retry attempts are tracked through the same generateJSON tracking pipeline as initial generation

Sprint 3.9: Schedule Generation Action & UI -- Implementation Complete
Files created (4):
src/types/ai-scheduling.ts (updated) -- Added ReadinessCheckResult, ReadinessIssue, ReadinessIssueSeverity, ReadinessIssueCategory, and AcceptedShift types used by the generation action and UI.
src/lib/validations/schedule-generation.schema.ts (new) -- Zod schemas for generateScheduleSchema, acceptGeneratedScheduleSchema, and checkReadinessSchema with proper validation of schedule IDs, time strings (HH:MM), date strings (YYYY-MM-DD), and shift arrays.
src/server/actions/schedule-generation.actions.ts (new) -- Three server actions following the strict 3-layer architecture:
checkGenerationReadiness -- Pre-generation data readiness checks (AI usage limits, missing hourly rates, availability completeness, labor requirements coverage, skill gaps, requirements outside operating hours)
generateSchedule -- Orchestrates the full AI pipeline: usage limit check -> SchedulingAgentService.buildSchedulingContext() -> generateWeekSchedule() -> usage logging. Returns GeneratedSchedule for preview without persisting.
acceptGeneratedSchedule -- Converts accepted shifts from the preview into CreateShiftInput objects and bulk-creates them via ShiftService.bulkCreate().
src/app/(dashboard)/dashboard/schedule/\_components/GenerateScheduleDialog.tsx (new) -- Multi-step dialog with four states:
Readiness -- Checklist with pass/fail indicators, stats cards, blocker/warning categorization
Generating -- Progress spinner with time estimate
Preview -- Delegates to GeneratedShiftPreview for day-by-day review
Failure -- Partial results summary, unfilled slots with reasons, recovery links (Adjust Labor Requirements, Review Staff Availability), and "Save as Draft" option when 80%+ shifts generated
src/app/(dashboard)/dashboard/schedule/\_components/GeneratedShiftPreview.tsx (new) -- Day-by-day preview component showing shift assignments with station colors, AI reasoning tooltips, validation warnings grouped by type (overtime risk, clopening risk, non-preferred station), unfilled slots with explanations, summary stats (total shifts, hours, unfilled), and Accept All / Regenerate / Cancel action buttons.
Files updated (2):
src/server/services/shift.service.ts -- Added bulkCreate() method that creates shifts individually with overlap checks, skipping conflicting shifts rather than failing the batch.
src/app/(dashboard)/dashboard/schedule/\_components/ScheduleActions.tsx -- Added "Generate Schedule" button with Sparkles icon (visible only for DRAFT schedules), GenerateScheduleDialog integration with open/close state, and cache invalidation callback on accept.
