import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";

import { fetchMyDroppedShifts, fetchMyPickups } from "./api";
import { useExchangeLastSeen } from "./last-seen-store";
import type { ExchangeShift } from "@/types";

// ─────────────────────────────────────────────────────────────
// `useExchangeBadge`
//
// Drives the red-dot indicator on the bottom-tab Exchange icon.
// Watches the caller's drops and pickups, and returns the number of
// rows that have "changed" since the user last opened the tab.
//
// "Changed" = either
//   • the row is currently awaiting manager approval
//     (`pending_coverage`), regardless of timestamp — the user still
//     has an open loop even if they've seen it before; or
//   • the row transitioned to a terminal decision state since
//     `lastSeenAt` (`manager_approved`, `denied`, or `cancelled`
//     with a picker that was the caller).
//
// We read the same react-query keys the Exchange screen uses so we
// get refetch-on-focus for free (via `lib/query-focus.ts`).
// ─────────────────────────────────────────────────────────────

const DECISION_STATUSES: ExchangeShift["status"][] = [
  "manager_approved",
  "denied",
  "cancelled",
];

export function useExchangeBadge(): { count: number } {
  const { userId } = useAuth();
  const { lastSeenAt, hasHydrated } = useExchangeLastSeen();

  const myDroppedQuery = useQuery({
    queryKey: ["exchange", userId, "mine"],
    queryFn: fetchMyDroppedShifts,
    enabled: Boolean(userId),
  });

  const myPickupsQuery = useQuery({
    queryKey: ["exchange", userId, "pickups"],
    queryFn: fetchMyPickups,
    enabled: Boolean(userId),
  });

  if (!hasHydrated || !userId) return { count: 0 };

  const rows = [
    ...(myDroppedQuery.data ?? []),
    ...(myPickupsQuery.data ?? []),
  ];

  const count = rows.reduce((acc, row) => {
    if (row.status === "pending_coverage") return acc + 1;
    if (DECISION_STATUSES.includes(row.status)) {
      const updated = new Date(row.updatedAt).getTime();
      if (lastSeenAt === null || updated > lastSeenAt) return acc + 1;
    }
    return acc;
  }, 0);

  return { count };
}
