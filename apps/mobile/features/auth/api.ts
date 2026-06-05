import { apiClient } from "@/lib/api-client";
import type { Membership } from "./store";

type TokenGetter = () => Promise<string | null>;

/**
 * Server response shape — `weekStartsOn` and `allowStaffToManageOwnSkills`
 * may be absent on older builds.
 */
type MembershipResponse = Omit<
  Membership,
  "weekStartsOn" | "allowStaffToManageOwnSkills"
> & {
  weekStartsOn?: Membership["weekStartsOn"];
  allowStaffToManageOwnSkills?: Membership["allowStaffToManageOwnSkills"];
};

/**
 * Fetches the signed-in user's OrganizationMember record.
 *
 * The Clerk JWT is passed in explicitly (rather than relying on the
 * Axios interceptor) so the very first call after sign-in can't race
 * with the interceptor's `setTokenGetter` effect. Without the token,
 * Clerk's middleware rejects the request with a non-JSON redirect and
 * AuthGate treats every fresh sign-in as "couldn't verify your account".
 *
 * Returns null when the user has no membership (HTTP 404). Any other
 * failure throws with a readable message so the caller can surface it.
 */
export async function fetchMembership(
  getToken: TokenGetter,
): Promise<Membership | null> {
  const token = await getToken();
  if (!token) {
    throw new Error("No Clerk session token available.");
  }

  try {
    const response = await apiClient.get<MembershipResponse>(
      "/me/membership",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    // Defensive defaults: these fields were added later, so a stale
    // server build could still respond without them.
    return {
      ...response.data,
      weekStartsOn: response.data.weekStartsOn ?? "monday",
      allowStaffToManageOwnSkills:
        response.data.allowStaffToManageOwnSkills ?? true,
    };
  } catch (error) {
    const err = error as {
      response?: { status?: number; data?: unknown };
      message?: string;
    };
    const status = err.response?.status;
    if (status === 404) return null;

    const detail =
      (typeof err.response?.data === "object" &&
        err.response?.data &&
        "error" in err.response.data &&
        typeof (err.response.data as { error?: unknown }).error === "string" &&
        ((err.response.data as { error: string }).error as string)) ||
      err.message ||
      "Unknown error";

    console.warn(
      `[mobile] /me/membership failed (status=${status ?? "network"}): ${detail}`,
    );
    throw new Error(detail);
  }
}
