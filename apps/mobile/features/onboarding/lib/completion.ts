import type { StaffDTO, StaffAvailabilityDTO } from "@sous/types";

import type { OnboardingStepId } from "./steps";

// ─────────────────────────────────────────────────────────────
// Onboarding completion rules.
//
// The wizard guides the user through four steps, but only two carry
// data the rest of the app genuinely depends on, so only those gate
// completion:
//
//   • profile      — name + a valid phone number (used for the roster
//                     and the scheduler's SMS confirmations).
//   • availability — a valid hours range and at least one day the user
//                     can actually work (without this the scheduler has
//                     nothing to place them into).
//
// Stations and notifications are intentionally optional: a manager may
// not have approved any stations yet, and push permission is a device
// choice the user can change later from Settings.
//
// This module is shared so the mobile Done screen and the server-side
// `/api/me/onboarding/complete` guard apply identical rules.
// ─────────────────────────────────────────────────────────────

export function isPhoneValid(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

/** True when the user marked at least one day with usable hours. */
export function hasAvailableDay(rows: StaffAvailabilityDTO[]): boolean {
  return rows.some(
    (row) =>
      row.preference !== "unavailable" &&
      Boolean(row.availableFrom) &&
      Boolean(row.availableTo),
  );
}

export interface OnboardingChecklistItem {
  stepId: OnboardingStepId;
  label: string;
  done: boolean;
}

/**
 * Evaluate which required steps are complete. `complete` is true only
 * when every required item is satisfied.
 */
export function buildOnboardingChecklist(
  staff: StaffDTO | null,
  availability: StaffAvailabilityDTO[],
): { items: OnboardingChecklistItem[]; complete: boolean } {
  const profileDone = Boolean(staff?.name?.trim()) && isPhoneValid(staff?.phone);

  const hoursValid =
    (staff?.maxHoursPerWeek ?? 0) >= (staff?.minHoursPerWeek ?? 0);
  const availabilityDone = hoursValid && hasAvailableDay(availability);

  const items: OnboardingChecklistItem[] = [
    { stepId: "profile", label: "Confirm your profile", done: profileDone },
    {
      stepId: "availability",
      label: "Set your weekly availability",
      done: availabilityDone,
    },
  ];

  return { items, complete: items.every((item) => item.done) };
}
