# Phase 2 Execution Plan — "The Scheduler Grid"

**Target Start**: After Phase 1 Complete  
**Sprints**: 2.1, 2.2, 2.3, 2.4  
**Goal**: A reactive grid to view and manage shifts.

---

## Prerequisites

Before starting Phase 2, ensure Phase 1 is verified:

```bash
npm run test:phase-1
```

**Required Phase 1 Assets**:
- ✅ `KitchenConfig` model with stations/roles
- ✅ `Staff` model with skills/proficiency
- ✅ `StaffService` with `getAll()` method
- ✅ ActionResponse pattern established
- ✅ Mongoose singleton in `src/lib/db.ts`
- ✅ Clerk auth integration

---

## New Dependencies

Install before starting Sprint 2.1:

```bash
npm install date-fns
```

| Package | Version | Purpose |
|---------|---------|---------|
| `date-fns` | ^4.x | Week calculations, date formatting, date range operations |

**Note**: Do NOT use moment.js or dayjs. `date-fns` is tree-shakeable and aligns with modern bundling practices.

---

## Sprint 2.1: Schedule & Shift Data Models

**Goal**: Establish the data layer for scheduling with proper relationships and validation.

### Files to Create

| File | Type | Description |
|------|------|-------------|
| `src/server/models/Schedule.ts` | Model | Week container with status (DRAFT/PUBLISHED) |
| `src/server/models/Shift.ts` | Model | Individual shift assignment |
| `src/server/services/schedule.service.ts` | Service | Schedule business logic |
| `src/server/services/shift.service.ts` | Service | Shift business logic + overlap detection |
| `src/server/actions/schedule.actions.ts` | Action | Schedule CRUD server actions |
| `src/server/actions/shift.actions.ts` | Action | Shift CRUD server actions |
| `src/lib/validations/schedule.schema.ts` | Validation | Schedule Zod schemas |
| `src/lib/validations/shift.schema.ts` | Validation | Shift Zod schemas with time validation |
| `src/types/schedule.ts` | Types | ScheduleDTO, ScheduleStatus enum |
| `src/types/shift.ts` | Types | ShiftDTO, converters |

### Data Model Specifications

#### Schedule Model

```typescript
// src/server/models/Schedule.ts
{
  _id: ObjectId,
  userId: string,              // Clerk user ID (restaurant owner)
  weekStartDate: Date,         // Monday 00:00:00 of the week
  status: 'DRAFT' | 'PUBLISHED',
  notes: string,               // Optional week notes
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// - (userId, weekStartDate) unique compound - One schedule per week per owner
```

#### Shift Model

```typescript
// src/server/models/Shift.ts
{
  _id: ObjectId,
  userId: string,              // Clerk user ID (for fast filtering)
  scheduleId: ObjectId,        // Reference to parent Schedule
  staffId: ObjectId,           // Reference to Staff member
  start: Date,                 // Shift start datetime
  end: Date,                   // Shift end datetime
  station: string,             // Must exist in KitchenConfig.stations
  notes: string,               // Optional shift notes
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// - (scheduleId, staffId) - Find all shifts for a staff member in a schedule
// - (userId, start, end) - Date range queries
// - (staffId, start, end) - Overlap detection
```

### Architecture Check: Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI LAYER                                 │
│  [Future] ScheduleGrid component                                │
│  - useQuery('schedule', { weekStart }) for schedule data        │
│  - useQuery('shifts', { scheduleId }) for shift data            │
│  - useMutation for createShift, updateShift, deleteShift        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ACTION LAYER                               │
│  schedule.actions.ts / shift.actions.ts                         │
│  - auth() check on every action                                  │
│  - dbConnect() before DB operations                              │
│  - Zod validation using schedule.schema / shift.schema           │
│  - Returns ActionResponse<ScheduleDTO> or ActionResponse<ShiftDTO>│
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVICE LAYER                               │
│  ScheduleService / ShiftService                                  │
│  - ONLY place that imports Schedule/Shift models                 │
│  - ShiftService.checkOverlap(staffId, start, end, excludeId?)    │
│  - ShiftService.createShift() validates no overlap               │
│  - Returns plain DTOs (no Mongoose documents)                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATABASE                                  │
│  schedules collection                                            │
│  shifts collection                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Validation Rules

**Schedule Schema** (`src/lib/validations/schedule.schema.ts`):
- `weekStartDate` must be a Monday (use `date-fns/startOfWeek`)
- `status` enum: DRAFT | PUBLISHED

**Shift Schema** (`src/lib/validations/shift.schema.ts`):
- `start` < `end` (refine validation)
- `station` must be validated against KitchenConfig at runtime
- Max shift duration: 12 hours (configurable)

### Service Methods to Implement

**ScheduleService**:
```typescript
getOrCreateForWeek(userId: string, weekStartDate: Date): Promise<ScheduleDTO>
getByWeek(userId: string, weekStartDate: Date): Promise<ScheduleDTO | null>
updateStatus(scheduleId: string, status: ScheduleStatus): Promise<ScheduleDTO>
```

**ShiftService**:
```typescript
getBySchedule(scheduleId: string): Promise<ShiftDTO[]>
getByStaffAndDateRange(staffId: string, start: Date, end: Date): Promise<ShiftDTO[]>
checkOverlap(userId: string, staffId: string, start: Date, end: Date, excludeShiftId?: string): Promise<boolean>
create(data: CreateShiftInput): Promise<ShiftDTO>
update(shiftId: string, data: UpdateShiftInput): Promise<ShiftDTO>
delete(shiftId: string): Promise<void>
```

### Success Criteria

✅ **Sprint 2.1 is complete when**:
1. Schedule and Shift documents can be created via service layer
2. Run `npx tsx scripts/test-models.ts` (temporary script) to verify:
   - Schedule document appears in MongoDB Compass
   - Shift document appears with correct `staffId` ObjectId reference
   - Compound index `(scheduleId, staffId)` exists on shifts collection
3. Overlap detection returns `true` when a conflicting shift exists

---

## Sprint 2.2: The Visual Grid (CSS Grid)

**Goal**: Build the schedule grid UI with week navigation and shift display.

### Files to Create

| File | Type | Description |
|------|------|-------------|
| `src/app/(dashboard)/dashboard/schedule/page.tsx` | Page | Schedule page (Server Component) |
| `src/app/(dashboard)/dashboard/schedule/_components/ScheduleGrid.tsx` | Component | Main grid component (Client) |
| `src/app/(dashboard)/dashboard/schedule/_components/ScheduleHeader.tsx` | Component | Week navigation + status |
| `src/app/(dashboard)/dashboard/schedule/_components/ShiftCard.tsx` | Component | Individual shift display |
| `src/app/(dashboard)/dashboard/schedule/_components/GridCell.tsx` | Component | Empty/clickable cell |
| `src/app/(dashboard)/dashboard/schedule/_components/StaffRow.tsx` | Component | Staff member row |
| `src/lib/utils/date.ts` | Utility | Date helpers using date-fns |

### UI Component Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│ Schedule Header                                                      │
│ [< Prev Week]  Week of January 20, 2026  [Next Week >]  [DRAFT ▼]   │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│ Schedule Grid                                                        │
│ ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────┐ │
│ │ Staff   │ Mon 20  │ Tue 21  │ Wed 22  │ Thu 23  │ Fri 24  │ ... │ │
│ ├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────┤ │
│ │ John D. │ [Shift] │         │ [Shift] │ [Shift] │         │     │ │
│ │ Jane S. │         │ [Shift] │ [Shift] │         │ [Shift] │     │ │
│ │ Bob M.  │ [Shift] │ [Shift] │         │ [Shift] │ [Shift] │     │ │
│ └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### CSS Grid Implementation

```css
/* Grid structure */
.schedule-grid {
  display: grid;
  grid-template-columns: 150px repeat(7, 1fr); /* Staff name + 7 days */
  grid-template-rows: auto repeat(var(--staff-count), minmax(80px, auto));
}
```

### Integration with Phase 1

**Using StaffService for Y-Axis**:
```typescript
// In ScheduleGrid.tsx
const { data: staff } = useQuery({
  queryKey: ['staff', 'active'],
  queryFn: () => listStaff() // Existing action from Phase 1
});

// Filter to active staff only
const activeStaff = staff?.filter(s => s.isActive) ?? [];
```

**Using KitchenConfig for Station Validation**:
- ShiftCard displays station badge
- Station color coding based on KitchenConfig.stations array index

### Date Utilities (`src/lib/utils/date.ts`)

```typescript
import { startOfWeek, endOfWeek, addWeeks, subWeeks, format, eachDayOfInterval } from 'date-fns';

export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 }); // Monday
}

export function getWeekDays(weekStart: Date): Date[] {
  return eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(weekStart, { weekStartsOn: 1 })
  });
}

export function formatWeekLabel(weekStart: Date): string {
  return `Week of ${format(weekStart, 'MMMM d, yyyy')}`;
}
```

### TanStack Query Integration

```typescript
// Query keys
const scheduleKeys = {
  all: ['schedules'] as const,
  week: (weekStart: string) => [...scheduleKeys.all, 'week', weekStart] as const,
};

const shiftKeys = {
  all: ['shifts'] as const,
  bySchedule: (scheduleId: string) => [...shiftKeys.all, 'schedule', scheduleId] as const,
};
```

### Architecture Check: UI Data Flow

```
User navigates to /dashboard/schedule
         │
         ▼
┌─────────────────────────────────────────┐
│ SchedulePage (Server Component)          │
│ - Provides initial week (today)          │
│ - Renders ScheduleGrid                   │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ ScheduleGrid (Client Component)          │
│ "use client"                             │
│ - useState for currentWeek               │
│ - useQuery for schedule data             │
│ - useQuery for shifts data               │
│ - useQuery for staff list (Phase 1)      │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Server Actions                           │
│ getScheduleForWeek(weekStart)            │
│ getShiftsForSchedule(scheduleId)         │
│ listStaff() (from Phase 1)               │
└─────────────────────────────────────────┘
```

### Success Criteria

✅ **Sprint 2.2 is complete when**:
1. Navigate to `/dashboard/schedule` and see the grid layout
2. Staff members from Phase 1 appear as rows (Y-axis)
3. Days of current week appear as columns (X-axis)
4. Week navigation (Prev/Next) changes the displayed week
5. Console shows: `useQuery` fetching schedule and shifts data
6. No TypeScript errors, no console errors

---

## Sprint 2.3: Shift Management (CRUD)

**Goal**: Enable creation, editing, and deletion of shifts with validation.

### Files to Create

| File | Type | Description |
|------|------|-------------|
| `src/app/(dashboard)/dashboard/schedule/_components/ShiftFormDialog.tsx` | Component | Create/Edit shift dialog |
| `src/app/(dashboard)/dashboard/schedule/_components/ShiftDeleteConfirm.tsx` | Component | Delete confirmation dialog |
| `src/components/ui/time-picker.tsx` | UI Component | Time input component |
| `src/components/ui/popover.tsx` | UI Component | Popover for quick actions (shadcn) |

### Interaction Patterns

**Click Empty Cell → Create Shift**:
1. User clicks empty GridCell
2. Dialog opens with pre-filled:
   - Staff: Row's staff member (readonly)
   - Date: Column's date (readonly)
   - Start Time: Kitchen open time (from KitchenConfig)
   - End Time: Kitchen open time + 8 hours
   - Station: First station from KitchenConfig
3. User adjusts times and station
4. Submit → `createShift` server action
5. Optimistic update → Shift appears immediately

**Click Existing ShiftCard → Edit Shift**:
1. User clicks ShiftCard
2. Dialog opens with current values
3. User modifies any field
4. Submit → `updateShift` server action
5. Optimistic update → Changes appear immediately

**Delete Shift**:
1. User clicks ShiftCard → opens dialog
2. User clicks "Delete" button in dialog footer
3. Confirmation dialog appears
4. Confirm → `deleteShift` server action
5. Optimistic update → Shift disappears immediately

### Server-Side Overlap Validation

**In ShiftService.create() and ShiftService.update()**:
```typescript
// Check for overlapping shifts BEFORE saving
const hasOverlap = await this.checkOverlap(
  userId,
  staffId,
  start,
  end,
  excludeShiftId // undefined for create, shiftId for update
);

if (hasOverlap) {
  throw new Error('This shift overlaps with an existing shift for this staff member');
}
```

**Overlap Query Logic**:
```typescript
// Two shifts overlap if:
// (A.start < B.end) AND (A.end > B.start)

const overlap = await Shift.findOne({
  userId,
  staffId,
  _id: { $ne: excludeShiftId }, // Exclude self on updates
  $or: [
    { start: { $lt: end }, end: { $gt: start } }
  ]
});

return overlap !== null;
```

### Optimistic Updates Pattern

```typescript
// In ShiftFormDialog.tsx
const queryClient = useQueryClient();

const createMutation = useMutation({
  mutationFn: createShift,
  onMutate: async (newShift) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: shiftKeys.bySchedule(scheduleId) });
    
    // Snapshot previous value
    const previousShifts = queryClient.getQueryData(shiftKeys.bySchedule(scheduleId));
    
    // Optimistically add new shift
    queryClient.setQueryData(shiftKeys.bySchedule(scheduleId), (old: ShiftDTO[]) => [
      ...old,
      { ...newShift, _id: 'temp-' + Date.now() } // Temporary ID
    ]);
    
    return { previousShifts };
  },
  onError: (err, newShift, context) => {
    // Rollback on error
    queryClient.setQueryData(shiftKeys.bySchedule(scheduleId), context?.previousShifts);
    toast.error('Failed to create shift');
  },
  onSettled: () => {
    // Refetch to sync with server
    queryClient.invalidateQueries({ queryKey: shiftKeys.bySchedule(scheduleId) });
  },
  onSuccess: () => {
    toast.success('Shift created');
    onClose();
  }
});
```

### Form Validation Rules

**ShiftForm Zod Schema**:
```typescript
const shiftFormSchema = z.object({
  staffId: z.string().min(1, 'Staff member is required'),
  date: z.coerce.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format'),
  station: z.string().min(1, 'Station is required'),
  notes: z.string().max(500).optional(),
}).refine((data) => {
  // Combine date + time for comparison
  const start = combineDateTime(data.date, data.startTime);
  const end = combineDateTime(data.date, data.endTime);
  return start < end;
}, {
  message: 'End time must be after start time',
  path: ['endTime']
});
```

### Architecture Check: Mutation Flow

```
User clicks "Save Shift"
         │
         ▼
┌─────────────────────────────────────────┐
│ ShiftFormDialog (Client)                 │
│ - Validates with Zod (client-side)       │
│ - Calls useMutation → createShift        │
│ - Optimistically updates cache           │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ createShift (Server Action)              │
│ - auth() check                           │
│ - dbConnect()                            │
│ - Zod validation (server-side)           │
│ - Calls ShiftService.create()            │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ ShiftService.create()                    │
│ - checkOverlap() → throws if conflict    │
│ - Validates station against KitchenConfig│
│ - Creates Shift document                 │
│ - Returns ShiftDTO                       │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ ActionResponse<ShiftDTO>                 │
│ { success: true, data: ShiftDTO }        │
│ OR                                       │
│ { success: false, error: 'Overlap...' }  │
└─────────────────────────────────────────┘
```

### Success Criteria

✅ **Sprint 2.3 is complete when**:
1. Click an empty cell → Dialog opens with correct staff/date pre-filled
2. Create a shift → Shift appears immediately (optimistic)
3. Click existing shift → Edit dialog opens with current values
4. Modify shift → Changes appear immediately
5. Delete shift → Shift disappears with confirmation
6. **Overlap Test**: Create shift 9am-5pm for Staff A on Monday. Try to create shift 1pm-9pm for same staff/day. Error message appears: "This shift overlaps..."
7. Toast notifications appear for success/error states

---

## Sprint 2.4: Week Actions & Polish

**Goal**: Complete the schedule workflow with publish, status management, and visual polish.

### Files to Create

| File | Type | Description |
|------|------|-------------|
| `src/app/(dashboard)/dashboard/schedule/_components/ScheduleStatusBadge.tsx` | Component | DRAFT/PUBLISHED badge |
| `src/app/(dashboard)/dashboard/schedule/_components/ScheduleActions.tsx` | Component | Publish, copy week actions |
| `src/app/(dashboard)/dashboard/schedule/_components/WeekSummary.tsx` | Component | Total hours, shift count |

### Schedule Status Workflow

```
┌─────────────────────────────────────────┐
│              DRAFT                       │
│  - Default state for new schedules       │
│  - All CRUD operations allowed           │
│  - Visual: Yellow/amber badge            │
└────────────────┬────────────────────────┘
                 │ Publish Action
                 ▼
┌─────────────────────────────────────────┐
│            PUBLISHED                     │
│  - Schedule is "live"                    │
│  - Edits still allowed (with warning)    │
│  - Visual: Green badge                   │
└─────────────────────────────────────────┘
```

### Publish Action

```typescript
// In schedule.actions.ts
export async function publishSchedule(scheduleId: string): Promise<ActionResponse<ScheduleDTO>> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: 'Unauthorized' };
  
  await dbConnect();
  
  // Validation before publish:
  // 1. Schedule exists and belongs to user
  // 2. At least one shift exists
  // 3. (Future) No coverage gaps
  
  return ScheduleService.updateStatus(scheduleId, 'PUBLISHED');
}
```

### Copy Week Feature

Allow users to copy shifts from a previous week:

```typescript
// In schedule.actions.ts
export async function copyWeekShifts(
  sourceScheduleId: string,
  targetWeekStart: Date
): Promise<ActionResponse<{ shiftsCreated: number }>>
```

**Logic**:
1. Get all shifts from source week
2. Calculate day offset between weeks
3. Create new shifts with adjusted dates
4. Skip any that would overlap with existing shifts
5. Return count of created shifts

### Week Summary Component

Display at the top of the grid:

```
┌─────────────────────────────────────────────────────────┐
│ Week Summary                                             │
│ Total Shifts: 24 | Total Hours: 192 | Staff Scheduled: 8 │
└─────────────────────────────────────────────────────────┘
```

### Visual Polish

**ShiftCard styling based on station**:
```typescript
const stationColors: Record<string, string> = {
  'Grill': 'bg-red-100 border-red-300 dark:bg-red-900/30',
  'Prep': 'bg-green-100 border-green-300 dark:bg-green-900/30',
  'Assembly': 'bg-blue-100 border-blue-300 dark:bg-blue-900/30',
  'Register': 'bg-purple-100 border-purple-300 dark:bg-purple-900/30',
};
```
Note: Reminder that stations shouldn't be hardcoded as the are customizable per kitchen

**Shift time display**:
```
┌───────────────────┐
│ Grill             │ ← Station badge
│ 9:00am - 5:00pm   │ ← Time range
│ 8h                │ ← Duration
└───────────────────┘
```

### Dashboard Navigation Update

Update the dashboard layout to include Schedule link:

```typescript
// In src/app/(dashboard)/dashboard/layout.tsx
const navItems = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/dashboard/schedule', label: 'Schedule', icon: Calendar },
  { href: '/dashboard/staff', label: 'Staff', icon: Users },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];
```

### Success Criteria

✅ **Sprint 2.4 is complete when**:
1. DRAFT badge shows on new schedules
2. Click "Publish" → Status changes to PUBLISHED with green badge
3. Week summary shows total shifts, hours, and staff count
4. Shift cards are color-coded by station
5. "Copy Previous Week" copies shifts with adjusted dates
6. Dashboard sidebar includes Schedule navigation link
7. No TypeScript errors, no linting errors

---

## Phase 2 Verification

### Create Test Script

Create `scripts/test-phase-2.ts` to programmatically verify Phase 2 functionality.

### Test Script Requirements

```typescript
// scripts/test-phase-2.ts

/**
 * Phase 2 End-to-End Verification
 * 
 * Prerequisites:
 * - MongoDB connection via MONGODB_URI env var
 * - At least one staff member exists (from Phase 1)
 * - Kitchen config exists with stations
 * 
 * Tests:
 * 1. Create Schedule for a specific week
 * 2. Create multiple Shifts
 * 3. Verify overlap detection (should reject)
 * 4. Query shifts by date range
 * 5. Update schedule status to PUBLISHED
 * 6. Cleanup test data
 */
```

### Test Cases

**Test 1: Schedule Creation**
```typescript
// Create schedule for test week
const testWeekStart = new Date('2026-01-26'); // A Monday
const schedule = await ScheduleService.getOrCreateForWeek(testUserId, testWeekStart);

assert(schedule._id, 'Schedule should have an ID');
assert(schedule.status === 'DRAFT', 'New schedule should be DRAFT');
assert(schedule.weekStartDate.getDay() === 1, 'Week start should be Monday');
```

**Test 2: Shift Creation**
```typescript
// Create shift for Monday
const shift1 = await ShiftService.create({
  userId: testUserId,
  scheduleId: schedule._id,
  staffId: testStaffId,
  start: new Date('2026-01-26T09:00:00'),
  end: new Date('2026-01-26T17:00:00'),
  station: 'Grill',
  notes: 'Test shift 1'
});

assert(shift1._id, 'Shift should have an ID');
assert(shift1.station === 'Grill', 'Station should match');
```

**Test 3: Overlap Detection**
```typescript
// Try to create overlapping shift (should fail)
try {
  await ShiftService.create({
    userId: testUserId,
    scheduleId: schedule._id,
    staffId: testStaffId, // Same staff
    start: new Date('2026-01-26T13:00:00'), // Overlaps 9am-5pm
    end: new Date('2026-01-26T21:00:00'),
    station: 'Prep',
    notes: 'Overlapping shift'
  });
  
  throw new Error('Should have thrown overlap error');
} catch (error) {
  assert(error.message.includes('overlap'), 'Error should mention overlap');
  console.log('✓ Overlap detection working');
}
```

**Test 4: Date Range Query**
```typescript
// Create shift for Tuesday
const shift2 = await ShiftService.create({
  userId: testUserId,
  scheduleId: schedule._id,
  staffId: testStaffId,
  start: new Date('2026-01-27T10:00:00'),
  end: new Date('2026-01-27T18:00:00'),
  station: 'Prep',
  notes: 'Test shift 2'
});

// Query range that includes both shifts
const shifts = await ShiftService.getByStaffAndDateRange(
  testStaffId,
  new Date('2026-01-26T00:00:00'),
  new Date('2026-01-28T00:00:00')
);

assert(shifts.length === 2, 'Should find 2 shifts in range');
```

**Test 5: Schedule Publishing**
```typescript
const publishedSchedule = await ScheduleService.updateStatus(schedule._id, 'PUBLISHED');
assert(publishedSchedule.status === 'PUBLISHED', 'Status should be PUBLISHED');
```

### NPM Script

Add to `package.json`:
```json
{
  "scripts": {
    "test:phase-2": "npx tsx scripts/test-phase-2.ts"
  }
}
```

### Expected Output

```
════════════════════════════════════════════════════════════
  PHASE 2 END-TO-END VERIFICATION
════════════════════════════════════════════════════════════

[STEP] Connecting to MongoDB
  ✓ Database connected

[STEP] Cleanup: Removing existing test data
  ✓ Cleanup complete

[STEP] Test 1: Schedule Creation
  Created schedule for week of 2026-01-26
  Status: DRAFT
  ✓ Schedule created and verified

[STEP] Test 2: Shift Creation
  Created shift: Monday 9:00am-5:00pm (Grill)
  ✓ Shift created and verified

[STEP] Test 3: Overlap Detection
  Attempted overlapping shift: Monday 1:00pm-9:00pm
  ✓ Overlap correctly rejected

[STEP] Test 4: Date Range Query
  Created shift: Tuesday 10:00am-6:00pm (Prep)
  Queried range: Jan 26 - Jan 28
  Found: 2 shifts
  ✓ Date range query working

[STEP] Test 5: Schedule Publishing
  Updated status: DRAFT → PUBLISHED
  ✓ Schedule published

[STEP] Final Cleanup: Removing test data
  ✓ Final cleanup complete

════════════════════════════════════════════════════════════
  ✓ PHASE 2 VERIFICATION PASSED
════════════════════════════════════════════════════════════

Results:
  - Schedule Created: 1 ✓
  - Shifts Created: 2 ✓
  - Overlap Detection: Blocked ✓
  - Date Range Query: 2 found ✓
  - Status Update: PUBLISHED ✓
  - Cleanup: Complete ✓
```

---

## File Summary

### Total New Files: 21

| Sprint | Files Created |
|--------|---------------|
| 2.1 | 10 (Models, Services, Actions, Schemas, Types) |
| 2.2 | 7 (Page, Grid Components, Date Utils) |
| 2.3 | 4 (Form Dialog, Delete Confirm, UI Components) |
| 2.4 | 3 (Status Badge, Actions, Summary) + layout update |

### Complete File List

```
src/
├── app/(dashboard)/dashboard/
│   ├── layout.tsx                    # UPDATE: Add Schedule nav link
│   └── schedule/
│       ├── page.tsx                  # NEW
│       └── _components/
│           ├── ScheduleGrid.tsx      # NEW
│           ├── ScheduleHeader.tsx    # NEW
│           ├── ShiftCard.tsx         # NEW
│           ├── GridCell.tsx          # NEW
│           ├── StaffRow.tsx          # NEW
│           ├── ShiftFormDialog.tsx   # NEW
│           ├── ShiftDeleteConfirm.tsx# NEW
│           ├── ScheduleStatusBadge.tsx # NEW
│           ├── ScheduleActions.tsx   # NEW
│           └── WeekSummary.tsx       # NEW
├── components/ui/
│   ├── time-picker.tsx               # NEW
│   └── popover.tsx                   # NEW (shadcn)
├── lib/
│   ├── utils/
│   │   └── date.ts                   # NEW
│   └── validations/
│       ├── schedule.schema.ts        # NEW
│       └── shift.schema.ts           # NEW
├── server/
│   ├── actions/
│   │   ├── schedule.actions.ts       # NEW
│   │   └── shift.actions.ts          # NEW
│   ├── models/
│   │   ├── Schedule.ts               # NEW
│   │   └── Shift.ts                  # NEW
│   └── services/
│       ├── schedule.service.ts       # NEW
│       └── shift.service.ts          # NEW
└── types/
    ├── schedule.ts                   # NEW
    └── shift.ts                      # NEW

scripts/
└── test-phase-2.ts                   # NEW
```

---

## Phase 2 Complete Checklist

- [ ] Sprint 2.1: Models & Services
  - [ ] Schedule model with indexes
  - [ ] Shift model with indexes
  - [ ] ScheduleService with CRUD
  - [ ] ShiftService with overlap detection
  - [ ] Zod schemas with time validation
  - [ ] ActionResponse patterns
  
- [ ] Sprint 2.2: Visual Grid
  - [ ] ScheduleGrid with CSS Grid layout
  - [ ] Week navigation (prev/next)
  - [ ] Staff rows from Phase 1 StaffService
  - [ ] ShiftCard rendering in correct cells
  - [ ] TanStack Query integration
  
- [ ] Sprint 2.3: CRUD Operations
  - [ ] Click-to-create shifts
  - [ ] Click-to-edit shifts
  - [ ] Delete with confirmation
  - [ ] Server-side overlap validation
  - [ ] Optimistic updates
  - [ ] Toast notifications
  
- [ ] Sprint 2.4: Polish & Actions
  - [ ] DRAFT/PUBLISHED status
  - [ ] Publish action with validation
  - [ ] Copy week feature
  - [ ] Week summary stats
  - [ ] Station color coding
  - [ ] Dashboard navigation update

- [ ] Verification
  - [ ] `scripts/test-phase-2.ts` passes
  - [ ] `npm run test:phase-2` exits with code 0

---
