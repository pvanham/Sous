import axios from "axios";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api";

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
