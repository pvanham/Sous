/**
 * Pending proposals expire after this many minutes.
 * Used by both the server-side expiration utility and
 * the client-side hook for belt-and-suspenders TTL checks.
 */
export const PROPOSAL_TTL_MINUTES = 30;
