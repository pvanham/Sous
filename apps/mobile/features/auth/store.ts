import { create } from "zustand";
import type { DayOfWeek } from "@sous/types";

export type MemberRole = "owner" | "manager" | "shift_lead" | "staff";

export interface Membership {
  role: MemberRole;
  orgId: string;
  locationId: string | null;
  /**
   * Calendar day each new weekly schedule starts on at this location
   * (default `"monday"`). Drives the home / schedule / exchange week
   * boundaries. The web app is the source of truth — see
   * `apps/web/src/app/api/me/membership/route.ts`.
   */
  weekStartsOn: DayOfWeek;
  /**
   * When `true`, staff can propose their own skill changes from the
   * profile + onboarding (both additions and removals require manager
   * approval). Defaults to `true`; gates the self-service skills UI.
   */
  allowStaffToManageOwnSkills: boolean;
}

interface AuthStore {
  membership: Membership | null;
  pendingSignInError: string | null;
  setMembership: (membership: Membership | null) => void;
  clearMembership: () => void;
  setPendingSignInError: (message: string | null) => void;
  consumePendingSignInError: () => string | null;
}

/**
 * Holds the signed-in user's OrganizationMember record, plus a one-shot
 * error message that survives a forced sign-out so the sign-in screen
 * can explain why the user was bounced back.
 */
export const useAuthStore = create<AuthStore>((set, get) => ({
  membership: null,
  pendingSignInError: null,
  setMembership: (membership) => set({ membership }),
  clearMembership: () => set({ membership: null }),
  setPendingSignInError: (message) => set({ pendingSignInError: message }),
  consumePendingSignInError: () => {
    const message = get().pendingSignInError;
    if (message) set({ pendingSignInError: null });
    return message;
  },
}));

/**
 * Selector hook for screens that just need the location's configured
 * first day of the week. Defaults to `"monday"` until the membership
 * query has loaded so the very first render of every screen lines up
 * with the historical default.
 */
export function useWeekStartsOn(): DayOfWeek {
  return useAuthStore((s) => s.membership?.weekStartsOn ?? "monday");
}

/**
 * Selector hook for whether staff may manage their own skills at this
 * location. Defaults to `true` until the membership query has loaded so
 * the self-service UI matches the server-side default.
 */
export function useAllowStaffToManageOwnSkills(): boolean {
  return useAuthStore(
    (s) => s.membership?.allowStaffToManageOwnSkills ?? true,
  );
}
