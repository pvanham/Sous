import json
from main import SolveRequest, _solve_schedule

def test_manager_coverage():
    payload = {
        "days": [
            {
                "dayIndex": 0,
                "dateStr": "2023-10-09",
                "dayName": "Monday",
                "dayOfWeek": 1,
                "slots": [
                    {
                        "slot": {
                            "station": "Grill",
                            "startTime": "09:00",
                            "endTime": "13:00",
                            "minStaff": 1,
                            "preferredStaff": 1,
                            "priority": "high",
                        },
                        "hasSufficientCandidates": True,
                        "candidates": [
                            {
                                "staffId": "emp1",
                                "staffName": "Line Cook Only",
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
                                "staffId": "emp_gm",
                                "staffName": "The GM",
                                "skills": [{"station": "Grill", "proficiency": 5}],
                                "preference": "available",
                                "currentWeekHours": 0,
                                "maxHoursPerWeek": 40,
                                "minHoursPerWeek": 0,
                                "overtimeWarning": False,
                                "preferredStations": ["Grill"],
                                "roles": ["GM"],
                                "hourlyRate": 30.0,
                            },
                        ]
                    },
                    {
                        "slot": {
                            "station": "Prep",
                            "startTime": "11:00",
                            "endTime": "15:00",
                            "minStaff": 1,
                            "preferredStaff": 1,
                            "priority": "high",
                        },
                        "hasSufficientCandidates": True,
                        "candidates": [
                            {
                                "staffId": "emp2",
                                "staffName": "The Manager",
                                "skills": [{"station": "Prep", "proficiency": 5}],
                                "preference": "preferred",
                                "currentWeekHours": 0,
                                "maxHoursPerWeek": 40,
                                "minHoursPerWeek": 0,
                                "overtimeWarning": False,
                                "preferredStations": ["Prep"],
                                "roles": ["Manager"],
                                "hourlyRate": 25.0,
                            },
                            {
                                "staffId": "emp3",
                                "staffName": "Prep Cook Only",
                                "skills": [{"station": "Prep", "proficiency": 5}],
                                "preference": "available",
                                "currentWeekHours": 0,
                                "maxHoursPerWeek": 40,
                                "minHoursPerWeek": 0,
                                "overtimeWarning": False,
                                "preferredStations": ["Prep"],
                                "roles": ["Prep Cook"],
                                "hourlyRate": 15.0,
                            }
                        ]
                    }
                ]
            }
        ],
        "maxHoursLookup": {
            "emp1": 40,
            "emp2": 40,
            "emp3": 40,
            "emp_gm": 40,
        },
        "minHoursLookup": {
            "emp1": 0,
            "emp2": 0,
            "emp3": 0,
            "emp_gm": 0,
        },
        "existingWeekHours": {
            "emp1": 0,
            "emp2": 0,
            "emp3": 0,
            "emp_gm": 0,
        },
        "settings": {
            "allowClopening": False,
            "clopeningThresholdMinutes": 600,
            "overtimeThresholdHours": 40,
            "overtimePolicy": "avoid",
            "softConstraintPriority": ["preferences", "fairness", "cost"]
        }
    }

    req = SolveRequest.model_validate(payload)
    res = _solve_schedule(req)
    
    print(f"Status: {res.status}")
    print(f"Objective Value: {res.objectiveValue}")
    print("Assignments:")
    for assignment in res.days[0].assignments:
        print(f"  {assignment.startTime}-{assignment.endTime} {assignment.station}: {assignment.staffName}")

if __name__ == "__main__":
    test_manager_coverage()
