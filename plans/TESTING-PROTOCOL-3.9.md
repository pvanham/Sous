# Sprint 3.9 Testing Protocol: AI Schedule Generation

Manual testing protocol for the AI Schedule Generation Action & UI. Uses the seed script to populate realistic test data.

---

## Section 1: Setup

### 1.1 Create a Clerk Test Account

1. Go to the Clerk dashboard and create a new user (or sign up fresh in the app).
2. Copy the Clerk user ID (starts with `user_`).

### 1.2 Configure Environment

Add the Clerk user ID to `.env.local`:

```
SEED_CLERK_USER_ID=user_2xxxYOUR_ID_HERE
```

### 1.3 Run the Seed Script

```bash
npm run seed:ai-test
```

**Expected output:**

- Organization "The Copper Ladle - AI Test" created
- Location "Main Kitchen" created
- Kitchen config: 6 stations (Grill, Saute, Prep, Assembly, Expo, Dish), 5 roles
- 23 active staff + 2 inactive = 25 total
- ~161 availability entries across 23 staff (inactive staff have no entries)
- ~62 labor requirements across all stations and days
- 5 time-off requests (3 approved, 1 pending, 1 denied)
- 1 DRAFT schedule for the target test week (next Monday from when you ran the script)
- The script prints the exact test week date -- note it down

### 1.4 Start the Dev Server

```bash
npm run dev
```

### 1.5 Log In

Log in with the Clerk account matching your `SEED_CLERK_USER_ID`. You should see the schedule page with "The Copper Ladle" data.

---

## Section 2: Readiness Check Tests

### Test 2.1: Open the Generate Dialog

1. Navigate to **Dashboard > Schedule**
2. Use the week navigator to select the **seeded test week** (the date printed by the seed script)
3. Verify the schedule shows as **DRAFT** with no existing shifts
4. Click the **"Generate Schedule"** button (sparkle icon, next to status badge)

**Expected:**
- Dialog opens with title "Generate Schedule"
- Shows "Pre-generation checklist for Week of [date]"
- Loading spinner appears briefly while readiness checks run

### Test 2.2: Verify Readiness Check Results

Once the checklist loads:

**Expected values:**
- **AI Generations**: Shows remaining out of 100 (e.g., "100 of 100 remaining")
- **Active Staff**: 23 (the 2 inactive staff are excluded)
- **Availability**: Should show a percentage (23 out of 23 staff with availability = 100%)
- **Requirements**: Should show the total count (~62)
- **Warning**: "1 staff missing hourly rate" (Natalie Wood has `hourlyRate: 0`)
- **No blockers** -- the "Generate Schedule" button should be enabled
- The warning badge shows "Warning" not "Required"

### Test 2.3: Verify Blocker Behavior

To test blocker state (optional -- requires manual DB cleanup after):

1. Close the dialog
2. Open the browser console or use the Settings page to temporarily note the current state
3. In MongoDB Compass or shell, delete all labor requirements for this location
4. Re-open the Generate dialog

**Expected:**
- Blocker: "No labor requirements defined. Set up requirements before generating."
- The "Generate Schedule" button is **disabled**
- The issue shows a red "Required" badge

**Cleanup:** Re-run `npm run seed:ai-test` to restore data.

---

## Section 3: Schedule Generation Tests

### Test 3.1: Happy Path -- Generate a Full Schedule

1. Open the Generate dialog (readiness checks pass)
2. Click **"Generate Schedule"**
3. Observe the generating state

**Expected during generation:**
- Dialog shows "Generating Schedule" with a spinner
- Text: "Analyzing staff, requirements, and availability..."
- Estimate: "This typically takes 30-90 seconds depending on schedule complexity."

**Expected after generation (preview):**
- Dialog transitions to "Generated Schedule" view
- Shows **day-by-day** expandable sections (Monday through Sunday)
- Each day shows shift assignments with:
  - Staff name
  - Station badge (colored by station)
  - Time range (e.g., "7:00am - 3:00pm")
- Summary stats at top:
  - Total Shifts (should be 30-60+ depending on AI decisions)
  - Total Hours
  - Unfilled Slots (likely some, especially Sunday)
- Generation time and token count shown
- "Accept All", "Regenerate", and "Cancel" buttons visible

### Test 3.2: Verify AI Reasoning Tooltips

1. In the preview, hover over any shift assignment row

**Expected:**
- A tooltip appears showing "AI Reasoning: [1-2 sentences explaining why this staff was assigned]"
- Reasoning references relevant factors (skill proficiency, availability, preference)

### Test 3.3: Verify Warnings Section

1. Look for an amber "Warnings" section in the preview

**Expected (some or all of these):**
- **Overtime Risk**: Staff near their `maxHoursPerWeek` limit
- **Clopening Risk**: Staff with late close shift followed by early open shift
- **Non-Preferred Station**: Staff assigned to a station not in their `preferredStations`

Each warning shows the staff name and a descriptive message.

### Test 3.4: Verify Unfilled Slots

1. Expand the **Sunday** section in the preview

**Expected:**
- Sunday has fewer available staff (many are unavailable on Sunday)
- Some slots may show as "Unfilled" with reasons like:
  - "No available qualified staff"
  - "All qualified candidates already scheduled"
- Kenji Tanaka (weekend dishwasher) should NOT appear on Sunday (approved time off)

### Test 3.5: Verify Time-Off Respect

1. Expand **Monday** and **Tuesday** sections

**Expected:**
- **Emily Nguyen** does NOT appear on Monday or Tuesday (approved time off Mon-Tue)
- She should still appear on other days if she has availability

2. Expand **Wednesday**, **Thursday**, **Friday** sections

**Expected:**
- **Maria Santos** does NOT appear on Wed, Thu, or Fri (approved 3-day vacation)

3. Check **Thursday**

**Expected:**
- **Jake Thompson** CAN appear on Thursday (his time-off request is PENDING, not approved)

4. Check **Tuesday**

**Expected:**
- **Tyler Kim** CAN appear on Tuesday (his time-off request was DENIED)

### Test 3.6: Accept Generated Schedule

1. In the preview, click **"Accept All (N shifts)"**

**Expected:**
- Toast notification: "Created N shifts" (or "Created N shifts (M skipped due to conflicts)")
- Dialog closes
- Schedule grid now shows all the generated shifts
- Shifts are visible in the correct day columns with station colors
- The shift cards match what was shown in the preview

### Test 3.7: Verify Usage Tracking

1. Click **"Generate Schedule"** again
2. Check the readiness dialog

**Expected:**
- AI Generations shows "99 of 100 remaining" (decremented by 1 from the first generation)

3. Cancel the dialog (don't generate again unless testing further)

---

## Section 4: Failure and Edge Case Tests

### Test 4.1: Clear and Regenerate

1. Click **"Clear Week"** to remove all generated shifts
2. Confirm the clear action
3. Click **"Generate Schedule"** again
4. Complete the generation and accept

**Expected:**
- Shifts are cleared successfully
- New generation produces a (potentially different) schedule
- Accept works again, shifts appear in grid

### Test 4.2: Published Schedule Hides Generate Button

1. With shifts in the schedule, click **"Publish Schedule"**
2. Observe the action bar

**Expected:**
- The **"Generate Schedule"** button disappears (only shown for DRAFT status)
- Only "Unpublish" button is visible

3. Click **"Unpublish"** to revert to DRAFT

**Expected:**
- "Generate Schedule" button reappears

### Test 4.3: Usage Limit Blocker

1. In MongoDB Compass, update the kitchen config's `aiSettings.monthlyGenerationLimit` to `1`
   ```
   db.kitchenconfigs.updateOne(
     { name: "The Copper Ladle" },
     { $set: { "aiSettings.monthlyGenerationLimit": 1 } }
   )
   ```
2. Since you've already generated 1-2 times, the usage count exceeds the limit
3. Open the Generate dialog

**Expected:**
- Blocker: "Monthly generation limit reached. Resets next month."
- AI Generations badge shows "0 of 1 remaining" (red/destructive badge)
- "Generate Schedule" button is **disabled**

4. Revert the limit:
   ```
   db.kitchenconfigs.updateOne(
     { name: "The Copper Ladle" },
     { $set: { "aiSettings.monthlyGenerationLimit": 100 } }
   )
   ```

### Test 4.4: Edge Case Staff in Generated Schedule

After any successful generation, check for these staff-specific behaviors:

- **Carlos Mendez** (`maxHoursPerWeek: 15`): Should only be assigned very short shifts, likely only 1-2 per week. Check that his total hours stay under 15.
- **Ryan O'Brien** (`minHoursPerWeek: 30`): Should be assigned substantial hours. The AI should try to give him 30+ hours across the week.
- **Natalie Wood** (`hourlyRate: 0`): Should still be assigned shifts (missing rate is a warning, not a blocker). She appears in the readiness warning.
- **Rachel Green** and **Tony Vasquez** (inactive): Should NEVER appear in any generated shifts.
- **Weekend-only staff** (Kenji, Aaliyah, Sam): Should only appear on their available days (Fri/Sat/Sun generally).
- **Part-time evening staff** (Tyler Kim, available 15:00-23:00 Mon-Thu): Should only appear in evening/dinner shifts.

---

## Section 5: Cleanup

When testing is complete:

```bash
npm run cleanup:ai-test
```

**Expected output:**
- All seeded data is removed (shifts, schedules, labor requirements, time-off requests, availability, staff, kitchen config, location, org membership, organization)
- Confirmation: "Cleanup complete"

**Verify:** Log in again. The app should show the onboarding flow (no organization found for the Clerk user).

---

## Quick Reference: Seeded Data Summary

| Data Type | Count | Notes |
|-----------|-------|-------|
| Stations | 6 | Grill, Saute, Prep, Assembly, Expo, Dish |
| Roles | 5 | Executive Chef, Sous Chef, Line Cook, Prep Cook, Dishwasher |
| Staff (active) | 23 | Mix of senior, line cooks, prep, dish, flex |
| Staff (inactive) | 2 | Rachel Green, Tony Vasquez |
| Availability entries | ~161 | 7 days each for 23 active staff |
| Labor requirements | ~62 | All stations, all days, multiple shifts |
| Time-off (approved) | 3 | Emily (Mon-Tue), Maria (Wed-Fri), Kenji (Sun) |
| Time-off (pending) | 1 | Jake (Thu) -- should NOT affect generation |
| Time-off (denied) | 1 | Tyler (Tue) -- should NOT affect generation |

### Key Edge Cases in Data

| Staff | Edge Case | What to Check |
|-------|-----------|---------------|
| Carlos Mendez | `maxHoursPerWeek: 15` | Gets very few shifts |
| Ryan O'Brien | `minHoursPerWeek: 30` | Gets substantial hours |
| Natalie Wood | `hourlyRate: 0` | Triggers readiness warning |
| Tyler Kim | Evening only (15:00-23:00) | Only in dinner shifts Mon-Thu |
| Kenji Tanaka | Weekend only + Sun time-off | Only on Fri/Sat, not Sunday |
| Sam Russo | Low proficiency on many stations | Flex filler, lower priority |
| Rachel Green | Inactive | Never appears |
| Tony Vasquez | Inactive | Never appears |
