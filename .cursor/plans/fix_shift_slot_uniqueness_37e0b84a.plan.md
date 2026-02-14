---
name: Fix shift slot uniqueness
overview: Widen the unique compound index on LaborRequirement from `{ orgId, locationId, dayOfWeek, station, startTime }` to also include `endTime`, so two shift slots can share the same start time on a station/day as long as they have different end times. True duplicates (identical time windows) remain blocked -- users should increase staffing counts instead.
todos:
  - id: widen-unique-index
    content: "Update the unique compound index in LaborRequirement model to include `endTime`: `{ orgId, locationId, dayOfWeek, station, startTime, endTime }`"
    status: completed
  - id: update-upsert-service
    content: Update the `upsert` method filter in LaborRequirementService to also match on `endTime`
    status: completed
  - id: update-upsert-action
    content: Update the `upsertLaborRequirement` action JSDoc to reflect the new matching key
    status: completed
  - id: update-e11000-messages
    content: Update E11000 error messages in `createLaborRequirement` and add E11000 handling to `updateLaborRequirement`
    status: completed
  - id: migration-script
    content: Create scripts/migrate-labor-index.ts to run syncIndexes() and swap the old 5-field unique index for the new 6-field one
    status: completed
isProject: false
---

# Fix Shift Slot Unique Index Constraint

## Problem

The `LaborRequirement` model (user-facing name: "shift slots") has a **unique compound index** on `{ orgId, locationId, dayOfWeek, station, startTime }`. This prevents creating two shift slots with the same station, day, and start time -- even if they have different end times. For example, you cannot create both a "Grill 13:00-20:00" and a "Grill 13:00-21:00" slot on Monday.

**Desired behavior:**

- Two slots on the same station/day with the **same start time but different end times** -- ALLOWED (e.g., 1pm-8pm and 1pm-9pm)
- Two slots on the same station/day with **identical start AND end times** -- BLOCKED (user should increase `minStaff`/`preferredStaff` instead of creating a duplicate)

**Solution:** Widen the unique index to include `endTime`.

## Architecture Compliance

All changes follow the strict 3-layer architecture defined in [ARCHITECTURE.md](ARCHITECTURE.md) and [.cursorrules](.cursorrules):

- **Model Layer** -- index definition change
- **Service Layer** -- update `upsert` filter to include `endTime`
- **Action Layer** -- update error messages and add E11000 handling to `update` action
- **UI Layer** -- no changes needed
- **Schedule Generation** -- no changes needed

## Changes by Layer

### 1. Model Layer: [src/server/models/LaborRequirement.ts](src/server/models/LaborRequirement.ts)

**Replace the unique index** (lines 94-97). Add `endTime` to the compound key:

```typescript
// BEFORE (current):
LaborRequirementSchema.index(
  { orgId: 1, locationId: 1, dayOfWeek: 1, station: 1, startTime: 1 },
  { unique: true },
);

// AFTER:
LaborRequirementSchema.index(
  {
    orgId: 1,
    locationId: 1,
    dayOfWeek: 1,
    station: 1,
    startTime: 1,
    endTime: 1,
  },
  { unique: true },
);
```

**Keep** the existing non-unique compound index (line 91) for query performance:

```typescript
LaborRequirementSchema.index({
  orgId: 1,
  locationId: 1,
  dayOfWeek: 1,
  station: 1,
});
```

### 2. Service Layer: [src/server/services/labor-requirement.service.ts](src/server/services/labor-requirement.service.ts)

**Update the `upsert` method filter** (~lines 150-170) to include `endTime` in its match criteria. The upsert now matches on `{ dayOfWeek, station, startTime, endTime }` -- it will update staffing/priority if an exact time-window match exists, or create a new slot if no match.

```typescript
// BEFORE (lines ~153-159):
const filter = {
  orgId: new Types.ObjectId(orgId),
  locationId: new Types.ObjectId(locationId),
  dayOfWeek: data.dayOfWeek,
  station: data.station,
  startTime: data.startTime,
};

// AFTER:
const filter = {
  orgId: new Types.ObjectId(orgId),
  locationId: new Types.ObjectId(locationId),
  dayOfWeek: data.dayOfWeek,
  station: data.station,
  startTime: data.startTime,
  endTime: data.endTime,
};
```

Also update the `$setOnInsert` block to no longer include `endTime` (since it is now in the filter), and move `endTime` out of the `$set` block (it is part of the identity, not a mutable field in upsert context):

```typescript
const update = {
  $set: {
    minStaff: data.minStaff,
    preferredStaff: data.preferredStaff,
    priority: data.priority,
  },
  $setOnInsert: {
    orgId: new Types.ObjectId(orgId),
    locationId: new Types.ObjectId(locationId),
    dayOfWeek: data.dayOfWeek,
    station: data.station,
    startTime: data.startTime,
    endTime: data.endTime,
  },
};
```

### 3. Action Layer: [src/server/actions/labor-requirement.actions.ts](src/server/actions/labor-requirement.actions.ts)

**a) Update `createLaborRequirement` E11000 error message** (~lines 220-225) to reflect the new constraint:

```typescript
// BEFORE:
"A labor requirement already exists for this day, station, and start time";

// AFTER:
"A shift slot with this exact time window already exists for this station and day. Adjust the staffing count on the existing slot instead.";
```

**b) Add E11000 handling to `updateLaborRequirement**` (~lines 271-276). Currently, if a user edits a slot's times to match an existing slot, they get a raw Mongoose error. Add a user-friendly catch:

```typescript
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "Failed to update labor requirement";
  if (message.includes("duplicate key") || message.includes("E11000")) {
    return {
      success: false,
      error:
        "A shift slot with this exact time window already exists for this station and day. Adjust the staffing count on the existing slot instead.",
    };
  }
  return { success: false, error: message };
}
```

**c) Update `upsertLaborRequirement` JSDoc** to reflect that matching now includes `endTime`.

### 4. Migration Script (new file)

Create `scripts/migrate-labor-index.ts` that:

1. Connects to MongoDB via `dbConnect()`
2. Calls `LaborRequirement.syncIndexes()` -- this drops the old 5-field unique index (no longer in schema) and creates the new 6-field unique index
3. Logs the dropped/created indexes and disconnects

This is necessary because Mongoose does **not** automatically drop or recreate indexes when the schema definition changes at runtime.

### 5. UI Layer -- No Changes Needed

- **RequirementFormDialog**: Uses separate `createLaborRequirement` / `updateLaborRequirement` based on `isEditMode`
- **LaborGrid**: Groups by `${station}-${dayOfWeek}` key and renders multiple slots per cell
- **RequirementCell**: Already renders a list of requirements with an "Add more" button
- **BulkRequirementFormDialog / BulkDeleteConfirmDialog**: Use `bulkCreate` / `bulkDelete` (no upsert)

The improved E11000 error message will surface correctly through the existing `toast.error()` calls in the UI mutation handlers.

### 6. Schedule Generation -- No Changes Needed

- `scheduling-agent.service.ts`: Treats each requirement as an independent slot
- `schedule-generation.ts`: Formats each slot independently in prompts
- `schedule-validator.service.ts`: Validates per-slot independently

## Why This is Safe

- **Existing data is unaffected**: The new index is strictly more permissive than the old one (same fields plus one more). All data that satisfied the old constraint automatically satisfies the new one.
- **True duplicates are still blocked**: Two slots with identical `(station, day, startTime, endTime)` will still trigger a unique constraint violation with a clear error message.
- `**upsert` still works: By including `endTime` in the filter, it correctly identifies an "existing identical slot" vs. "new slot with different end time."
- `**update` is now safe: Adding E11000 handling means users get a clear message if they edit a slot to collide with another.

## Verification

After applying changes:

1. Run the migration script: `npx tsx scripts/migrate-labor-index.ts`
2. Verify indexes in MongoDB: the old 5-field unique index is gone, the new 6-field unique index exists
3. Test creating two slots with same station/day/startTime but different endTimes -- should succeed
4. Test creating two slots with identical station/day/startTime/endTime -- should fail with a helpful message
5. Test editing a slot's endTime to match another slot -- should fail with a helpful message
6. Confirm the schedule generator processes all slots correctly
