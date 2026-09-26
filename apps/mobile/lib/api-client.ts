import axios from "axios";
import Constants from "expo-constants";

const CONFIGURED_API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api";

/**
 * In a physical-device dev client, `localhost` / a stale LAN IP in
 * `.env` will not reach this machine. Metro already has the right
 * host (the phone loaded the bundle from it), so rewrite the API
 * hostname to match and keep the configured port + `/api` path.
 */
function resolveApiBaseUrl(): string {
  const configured = CONFIGURED_API_URL;
  if (typeof __DEV__ === "undefined" || !__DEV__) return configured;

  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return configured;
  const metroHost = hostUri.split(":")[0];
  if (!metroHost) return configured;

  try {
    const url = new URL(configured);
    url.hostname = metroHost;
    return url.toString().replace(/\/$/, "");
  } catch {
    return configured;
  }
}

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * Pre-configured Axios instance for all API calls.
 *
 * Authentication is handled via a request interceptor that injects the
 * Clerk JWT. Because Axios interceptors run outside the React tree, the
 * token getter is injected at runtime through `setTokenGetter`.
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

type TokenGetter = () => Promise<string | null>;
let getToken: TokenGetter | null = null;

/**
 * Call once from the root layout to wire Clerk's `getToken` into the
 * Axios request pipeline. Subsequent requests will automatically carry
 * the `Authorization: Bearer <jwt>` header.
 */
export function setTokenGetter(getter: TokenGetter): void {
  getToken = getter;
}

apiClient.interceptors.request.use(async (config) => {
  if (getToken) {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});
