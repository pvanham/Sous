import { AxiosError } from "axios";
import type { StaffDTO } from "@sous/types";

import { apiClient } from "@/lib/api-client";

// ─────────────────────────────────────────────────────────────
// Onboarding feature — server-state access layer.
//
// The wizard itself reuses existing mutations (`useUpdateMyStaff`,
// `useSaveMyAvailability`, `useUpdateNotificationPreferencesMutation`)
// for individual steps. The only onboarding-specific endpoint is the
// final completion stamp; that's what this file owns.
//
// Backend contract — `apps/web/src/app/api/me/onboarding/complete/route.ts`
//   • Auth: Clerk JWT injected by the Axios interceptor.
//   • POST only; no body.
//   • Idempotent — re-calling after completion returns the existing
//     record unchanged.
//   • 404 for managers/owners with no Staff row (the wizard never
//     reaches this code path for them, but we surface the error
//     gracefully for defence in depth).
// ─────────────────────────────────────────────────────────────

type SerializedStaff = Omit<
  StaffDTO,
  "createdAt" | "updatedAt" | "onboardingCompletedAt"
> & {
  createdAt: string;
  updatedAt: string;
  onboardingCompletedAt: string | null;
};

function reviveStaff(raw: SerializedStaff): StaffDTO {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    onboardingCompletedAt:
      raw.onboardingCompletedAt === null
        ? null
        : new Date(raw.onboardingCompletedAt),
  };
}

/**
 * Stamp `Staff.onboardingCompletedAt` for the caller. Returns the
 * updated `StaffDTO` so the mobile cache can be primed in one shot
 * — `AuthGate` will see the new value on the next render pass and
 * route the user into the tabs.
 */
export async function completeOnboarding(): Promise<StaffDTO> {
  try {
    const response = await apiClient.post<SerializedStaff>(
      "/me/onboarding/complete",
    );
    return reviveStaff(response.data);
  } catch (err) {
    throw unwrapServerError(err, "Could not finish onboarding.");
  }
}

function unwrapServerError(err: unknown, fallback: string): Error {
  if (err instanceof AxiosError) {
    const body = err.response?.data as { error?: unknown } | undefined;
    const serverMessage =
      typeof body?.error === "string" ? body.error : null;
    return new Error(serverMessage ?? err.message ?? fallback);
  }
  if (err instanceof Error) return err;
  return new Error(fallback);
}
