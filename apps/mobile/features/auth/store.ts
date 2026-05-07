import { create } from "zustand";

export type MemberRole = "owner" | "manager" | "shift_lead" | "staff";

export interface Membership {
  role: MemberRole;
  orgId: string;
  locationId: string | null;
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
