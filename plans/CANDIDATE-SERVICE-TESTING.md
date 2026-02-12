# CandidateService Testing Instructions (Sprint 3.5)

## Overview

The CandidateService (Hard Filter Layer) has two scripts for verification:

1. **Automated test script** -- seeds data, runs 9 test cases with assertions, cleans up.
2. **Seed script** -- populates the DB with test data for manual inspection (optional).

All testing is done at the service layer. No Clerk auth is needed -- the scripts use a fake user ID (`user_test_candidate_2026`) and create their own Organization/Location/Members.

---

## Quick Start: Run the Automated Tests

```bash
npm run test:phase-3.5
```

This single command will:

1. Create a test organization, location, kitchen config, 10 staff members, availability, time-off requests, a schedule with 9 shifts, and 4 labor requirements.
2. Run 9 test cases covering all CandidateService methods and edge cases.
3. Print pass/fail for each assertion (40+ individual checks).
4. Clean up all test data.
5. Exit with code 0 on success, 1 on any failure.

**Required:** `MONGODB_URI` must be set in `.env.local`.

---

## Optional: Seed Data for Manual Inspection

If you want to browse the test data in MongoDB Compass or Atlas:

```bash
# Seed the database
npm run seed:candidate-test

# When done inspecting, clean up
npm run cleanup:candidate-test
```

The seed script prints all created IDs so you can query them directly.

**Note:** This data lives under a separate organization (`CandidateTest Kitchen Co`) with a fake user ID, so it will not appear in the Sous dashboard UI (which resolves your real Clerk user).

---

## What the Tests Verify

### Test 1: Grill Mon 09:00-17:00 (main filter pipeline)

Exercises all 5 hard filters in sequence:

- **Active filter:** Grace Kim excluded (inactive)
- **Availability filter:** Eve Santos excluded (availability only 06:00-12:00), Hank Johnson excluded (no Monday availability)
- **Time-off filter:** Charlie Park excluded (approved time-off Feb 16-17)
- **Skills filter:** Diana Lee excluded (no Grill skill)
- **Shift overlap filter:** Bob Martinez excluded (existing 09:00-13:00 shift), Frank Wilson excluded (existing 06:00-14:00 shift)
- **Adjacent shift edge case:** Jack Rivera included (his 06:00-09:00 shift ends exactly when the slot starts -- adjacent, not overlapping)
- **Pending time-off edge case:** Ivy Thompson included (only approved time-off excludes)
- **Sort verification:** preferred before available, then proficiency descending, then name alphabetical

Expected result: Alice Chen, Ivy Thompson, Jack Rivera (3 candidates)

### Test 2: Prep Mon 09:00-17:00 (skills filter)

Verifies that Diana Lee (Prep prof 5) appears first. Jack Rivera excluded (no Prep skill).

Expected result: Diana Lee, Alice Chen, Ivy Thompson (3 candidates)

### Test 3: Grill Mon 17:00-22:00 (overtime warning)

Verifies Frank Wilson's overtime flag (35.5h existing + 5h proposed = 40.5 > 40). Also verifies Bob Martinez excluded (availability ends at 17:00).

Expected result: Alice Chen, Ivy Thompson, Frank Wilson (OT=true), Jack Rivera (4 candidates)

### Test 4: Dish Mon 09:00-17:00 (insufficient candidates)

Only Jack Rivera has Dish skill. Verifies hasSufficientCandidates = false (1 < 3 minStaff).

### Test 5: Nonexistent station "Sushi"

No one has this skill. Verifies empty result.

### Test 6: wouldCauseOvertime (4 sub-tests)

- Frank 35.5h + 5h vs max 40 --> true
- Alice 16h + 8h vs max 40 --> false
- Boundary: 0h + 8h vs max 8 --> false (equal, not greater)
- Barely over: 0h + 8h vs max 7.9 --> true

### Test 7: getCandidatesForDay (all 4 Monday requirements)

Verifies batched processing produces the same results as individual slot calls. Checks hasSufficientCandidates per slot.

### Test 8: Empty labor requirements

getCandidatesForDay with empty array returns empty array.

### Test 9: Sunday slot (no availability)

No staff has Sunday availability. Returns empty array.

---

## Troubleshooting

**"MONGODB_URI environment variable is not set"**

Make sure your `.env.local` file contains `MONGODB_URI=mongodb+srv://...`.

**Test data collision**

If a previous run crashed without cleanup, run `npm run cleanup:candidate-test` first, then re-run the test.

**Unexpected failures**

The test script prints detailed output for each filter step. Look for the `FAIL` lines and compare actual vs expected values. The most common issues would be:

- Data from a previous incomplete run still in the DB (run cleanup first)
- Changes to the underlying service methods that alter filter behavior
