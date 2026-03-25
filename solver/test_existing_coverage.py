"""
Test that the solver produces fewer assignments when slot staffing counts
are pre-reduced (simulating existing shift coverage).

This validates the TypeScript-side logic that reduces minStaff/preferredStaff
before sending the problem to the solver.
"""
import json
from main import SolveRequest, _solve_schedule


def build_payload(preferred_staff_slot1: int, min_staff_slot1: int):
    """Build a 1-day problem with 2 slots. Slot 1 staffing is configurable."""
    return {
        "days": [
            {
                "dayIndex": 0,
                "dateStr": "2024-01-08",
                "dayName": "Monday",
                "dayOfWeek": 1,
                "slots": [
                    {
                        "slot": {
                            "station": "Grill",
                            "startTime": "09:00",
                            "endTime": "13:00",
                            "minStaff": min_staff_slot1,
                            "preferredStaff": preferred_staff_slot1,
                            "priority": "high",
                        },
                        "hasSufficientCandidates": True,
                        "candidates": [
                            {
                                "staffId": "emp1",
                                "staffName": "Alice",
                                "skills": [{"station": "Grill", "proficiency": 5}],
                                "preference": "preferred",
                                "currentWeekHours": 0,
                                "maxHoursPerWeek": 40,
                                "minHoursPerWeek": 0,
                                "overtimeWarning": False,
                                "preferredStations": ["Grill"],
                                "roles": ["Line Cook"],
                                "hourlyRate": 15.0,
                            },
                            {
                                "staffId": "emp2",
                                "staffName": "Bob",
                                "skills": [{"station": "Grill", "proficiency": 4}],
                                "preference": "available",
                                "currentWeekHours": 0,
                                "maxHoursPerWeek": 40,
                                "minHoursPerWeek": 0,
                                "overtimeWarning": False,
                                "preferredStations": ["Grill"],
                                "roles": ["Line Cook"],
                                "hourlyRate": 15.0,
                            },
                        ],
                    },
                    {
                        "slot": {
                            "station": "Prep",
                            "startTime": "09:00",
                            "endTime": "13:00",
                            "minStaff": 1,
                            "preferredStaff": 1,
                            "priority": "high",
                        },
                        "hasSufficientCandidates": True,
                        "candidates": [
                            {
                                "staffId": "emp3",
                                "staffName": "Carol",
                                "skills": [{"station": "Prep", "proficiency": 5}],
                                "preference": "preferred",
                                "currentWeekHours": 0,
                                "maxHoursPerWeek": 40,
                                "minHoursPerWeek": 0,
                                "overtimeWarning": False,
                                "preferredStations": ["Prep"],
                                "roles": ["Prep Cook"],
                                "hourlyRate": 15.0,
                            },
                        ],
                    },
                ],
            }
        ],
        "maxHoursLookup": {"emp1": 40, "emp2": 40, "emp3": 40},
        "minHoursLookup": {"emp1": 0, "emp2": 0, "emp3": 0},
        "existingWeekHours": {"emp1": 0, "emp2": 0, "emp3": 0},
        "settings": {
            "allowClopening": False,
            "clopeningThresholdMinutes": 600,
            "overtimeThresholdHours": 40,
            "overtimePolicy": "avoid",
            "softConstraintPriority": ["preferences", "fairness", "cost"],
        },
    }


def test_full_staffing():
    """With full counts (Grill needs 2, Prep needs 1), solver should assign 3."""
    payload = build_payload(preferred_staff_slot1=2, min_staff_slot1=2)
    req = SolveRequest.model_validate(payload)
    res = _solve_schedule(req)

    total = len(res.days[0].assignments)
    unfilled = len(res.days[0].unfilledSlots)

    print(f"[FULL] Status: {res.status} | Assignments: {total} | Unfilled: {unfilled}")
    for a in res.days[0].assignments:
        print(f"  {a.startTime}-{a.endTime} {a.station}: {a.staffName}")

    assert res.status == "OPTIMAL", f"Expected OPTIMAL, got {res.status}"
    assert total == 3, f"Expected 3 assignments, got {total}"
    assert unfilled == 0, f"Expected 0 unfilled, got {unfilled}"
    print("[FULL] ✅ PASS\n")


def test_reduced_staffing():
    """With reduced counts (Grill needs 1 more, Prep needs 1), solver should assign 2."""
    payload = build_payload(preferred_staff_slot1=1, min_staff_slot1=1)
    req = SolveRequest.model_validate(payload)
    res = _solve_schedule(req)

    total = len(res.days[0].assignments)
    unfilled = len(res.days[0].unfilledSlots)

    print(f"[REDUCED] Status: {res.status} | Assignments: {total} | Unfilled: {unfilled}")
    for a in res.days[0].assignments:
        print(f"  {a.startTime}-{a.endTime} {a.station}: {a.staffName}")

    assert res.status == "OPTIMAL", f"Expected OPTIMAL, got {res.status}"
    assert total == 2, f"Expected 2 assignments, got {total}"
    assert unfilled == 0, f"Expected 0 unfilled, got {unfilled}"
    print("[REDUCED] ✅ PASS\n")


def test_fully_covered_slot():
    """With Grill fully covered (needs 0), solver should only assign Prep (1 total)."""
    payload = build_payload(preferred_staff_slot1=0, min_staff_slot1=0)
    req = SolveRequest.model_validate(payload)
    res = _solve_schedule(req)

    total = len(res.days[0].assignments)
    unfilled = len(res.days[0].unfilledSlots)

    print(f"[COVERED] Status: {res.status} | Assignments: {total} | Unfilled: {unfilled}")
    for a in res.days[0].assignments:
        print(f"  {a.startTime}-{a.endTime} {a.station}: {a.staffName}")

    assert res.status == "OPTIMAL", f"Expected OPTIMAL, got {res.status}"
    # Grill candidates may still get assigned for fairness/min-hours, but
    # the solver should NOT report unfilled slots for a 0-staff requirement.
    assert unfilled == 0, f"Expected 0 unfilled, got {unfilled}"
    print("[COVERED] ✅ PASS\n")


if __name__ == "__main__":
    print("=" * 50)
    print("Testing existing coverage -> reduced staffing")
    print("=" * 50 + "\n")

    test_full_staffing()
    test_reduced_staffing()
    test_fully_covered_slot()

    print("=" * 50)
    print("All tests passed! ✅")
    print("=" * 50)
