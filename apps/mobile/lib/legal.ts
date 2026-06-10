// ─────────────────────────────────────────────────────────────
// Legal / support links surfaced in-app.
//
// Both the Apple App Store and Google Play require a reachable
// privacy policy, and Apple expects it linked from inside the app
// (Settings and/or the auth screen). We host the canonical copies on
// the marketing site, so the URLs are derived from the same origin
// the app already talks to (`EXPO_PUBLIC_API_URL`) minus the `/api`
// suffix — that keeps dev / staging / prod links correct without a
// second env var to forget to set.
// ─────────────────────────────────────────────────────────────

const DEFAULT_WEB_ORIGIN = "https://sous.app";

/**
 * Resolve the marketing web origin from the configured API URL.
 * `EXPO_PUBLIC_API_URL` points at the web app's `/api` namespace
 * (e.g. `https://app.sous.app/api`), so the public site lives one
 * path segment up. Falls back to the production origin if the env var
 * is missing or unparseable.
 */
function resolveWebOrigin(): string {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return DEFAULT_WEB_ORIGIN;
  try {
    const url = new URL(apiUrl);
    return url.origin;
  } catch {
    return DEFAULT_WEB_ORIGIN;
  }
}

const WEB_ORIGIN = resolveWebOrigin();

export const PRIVACY_POLICY_URL = `${WEB_ORIGIN}/privacy`;
export const TERMS_OF_SERVICE_URL = `${WEB_ORIGIN}/terms`;
export const SUPPORT_EMAIL = "support@sous.app";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
