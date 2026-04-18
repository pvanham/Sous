# 08 — Mobile Architecture (Expo)

> The staff-facing companion app. Different runtime (React Native,
> Expo SDK 54), same auth (Clerk), same types (`@sous/types`), and a
> thin HTTP client that talks to the web app's route handlers. For
> the web app's internal architecture, see
> [02-layer-patterns.md](./02-layer-patterns.md).

---

## 1. Scope & audience

The mobile app is built for **staff, shift leads, managers, and
owners** who need to interact with their schedule on the go. Read-side
features (home, schedule, exchange, time-off) are available to every
role; write-side actions are gated server-side by the same RBAC the
web app uses.

**What the mobile app does** today:

- Sign in via Clerk (email + password flow, session persists via
  `expo-secure-store`).
- Verify the Clerk user has an `OrganizationMember` record via
  `GET /api/me/membership` — no membership means we sign the user
  out and explain why.
- Render four tabs: **Home**, **Schedule**, **Exchange**, **Time Off**.

**What the mobile app does not do yet**: most feature screens still
render **mock data** (see §10). The Axios pipeline, auth wiring,
TanStack Query setup, and UI are real — the API endpoints that back
them need to ship on the web app before those screens go live.

---

## 2. Stack

| Concern | Choice |
|---------|--------|
| Runtime | React Native 0.81, React 19 |
| SDK | Expo SDK 54 (`expo` ~54.0.33) |
| Router | `expo-router` v6 (file-based) |
| Styling | NativeWind 5 (preview) + Tailwind v4 tokens |
| Auth | `@clerk/clerk-expo` + `expo-secure-store` for token cache |
| HTTP | `axios` with a global interceptor |
| Server state | `@tanstack/react-query` 5 |
| Local state | `zustand` 5 |
| Shared types | `@sous/types` workspace package |
| Build tooling | Metro via Expo |

No GraphQL, no Redux, no Apollo. The mobile app reuses the same
Zod/DTO package the web app uses, so no type is duplicated.

---

## 3. Directory layout

```
apps/mobile/
├── app/                        — expo-router roots (file-based)
│   ├── _layout.tsx             — Clerk + Query + AuthGate + theme providers
│   ├── (auth)/                 — group: sign-in, forgot-password
│   │   ├── _layout.tsx
│   │   ├── sign-in.tsx
│   │   └── forgot-password.tsx
│   └── (tabs)/                 — group: authenticated tab bar
│       ├── _layout.tsx
│       ├── index.tsx           — Home tab
│       ├── schedule.tsx
│       ├── exchange.tsx
│       └── time-off.tsx
├── features/                   — domain-sliced UI + data-access
│   ├── auth/                   — membership fetch, auth store
│   ├── home/                   — next shift, announcements
│   ├── schedule/               — weekly roster, shift detail
│   ├── exchange/               — drop/pickup board
│   └── time-off/               — request list + submit form
├── components/                 — cross-feature UI primitives
│   ├── haptic-tab.tsx
│   └── ui/                     — IconSymbol, buttons, etc.
├── hooks/                      — use-color-scheme, use-theme-color
├── lib/                        — cross-cutting infra
│   ├── api-client.ts           — Axios instance + token interceptor
│   ├── query-client.ts         — TanStack QueryClient
│   └── token-cache.ts          — Clerk tokenCache (SecureStore)
├── constants/                  — colors, theme
├── types/                      — mobile-only types (e.g. Announcement)
├── global.css                  — Tailwind + NativeWind design tokens
├── app.json                    — Expo config
└── .env.example
```

Each `features/<name>/` folder mirrors the same shape:

```
features/<name>/
├── api.ts        — server calls (apiClient.get / post / …)
├── screens/      — screen components rendered by app/(tabs)/<name>.tsx
├── components/   — feature-local UI
└── store.ts      — feature-local Zustand store (auth only today)
```

Only `features/auth/` has a store. Other features pull server state
directly with TanStack Query — do not add Zustand stores for
server-owned data.

---

## 4. Routing (expo-router)

Expo Router uses file-based routing. Two route groups drive the whole
nav tree:

- `app/(auth)/*` — unauthenticated screens. `sign-in.tsx` is the
  default, `forgot-password.tsx` is linked from it.
- `app/(tabs)/*` — authenticated tab bar. `index.tsx` is the Home
  tab; the others are one-per-tab screen files.

The top-level `<Stack>` in `app/_layout.tsx` switches between the two
groups based on auth state. The tab bar (`app/(tabs)/_layout.tsx`)
uses `<Tabs>` with SF Symbols via `IconSymbol` and `HapticTab` for
tactile feedback.

Do not add a bare `app/index.tsx` or `app/_layout.tsx` route outside
these groups; every screen should live inside `(auth)` or `(tabs)`.

---

## 5. `_layout.tsx` — the one file that wires everything

`apps/mobile/app/_layout.tsx` is the single source of provider
truth. It composes, in order:

1. `<ClerkProvider>` with `tokenCache` (SecureStore-backed) and the
   `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`. Missing the env var is a
   hard error at module load.
2. `<ClerkLoaded>` so children render only after Clerk hydrates.
3. `<QueryClientProvider>` with the shared TanStack `queryClient`.
4. `<ThemeProvider>` (React Navigation) toggled by `useColorScheme`.
5. `<AuthGate>` — the redirect + membership check described below.
6. `<Stack>` with `(auth)` and `(tabs)` screens.

### `AuthGate`

Runs inside `_layout.tsx`. Its responsibilities:

- Wire Clerk's `getToken` into the Axios interceptor exactly once
  (`setTokenGetter(getToken)`).
- Fire `fetchMembership(getToken)` via TanStack Query once the user
  is signed in. Cache 5 min, retry 1.
- On success, push the membership into `useAuthStore`.
- On 404 (no membership), call `signOut()` with an error that the
  sign-in screen surfaces via `consumePendingSignInError()`.
- On network or Clerk errors, also sign out with a readable message.
- Redirect between `(auth)` and `(tabs)` based on `segments[0]`.

If you need new cross-cutting setup (logging, Sentry, feature flags),
add a new provider inside `_layout.tsx` rather than a per-tab wrapper.
Don't move the providers elsewhere.

---

## 6. Auth: Clerk + SecureStore

### Token cache (`lib/token-cache.ts`)

Implements Clerk's `TokenCache` interface backed by `expo-secure-store`:

```ts
export const tokenCache: TokenCache = {
  async getToken(key: string) {
    const item = await SecureStore.getItemAsync(key);
    return item;
  },
  async saveToken(key: string, value: string) {
    await SecureStore.setItemAsync(key, value);
  },
};
```

- **Never log** tokens, **never** store them in AsyncStorage.
- Stay on SecureStore — the Clerk docs require a secure cache and
  our threat model assumes the session JWT is sensitive.

### Membership verification (`features/auth/api.ts`)

`fetchMembership(getToken)` is called on every app launch from
`AuthGate`:

- It fetches the token **inline** and sets the `Authorization`
  header explicitly rather than relying on the Axios interceptor.
  This avoids a race where the very first request fires before
  `setTokenGetter` runs.
- On HTTP 404 it returns `null` (user exists in Clerk but has no
  `OrganizationMember` in Mongo). AuthGate treats this as "sign
  out with a friendly message."
- On any other error it throws a formatted message so
  `pendingSignInError` is meaningful to the user.

The backing endpoint is `/api/me/membership` on the web app (see
[05-api-and-testing.md](./05-api-and-testing.md)). It also self-heals
missing memberships from Clerk invitation metadata when the
`user.created` webhook was missed — that is the **web** side's
concern, not the mobile side's.

---

## 7. Axios client (`lib/api-client.ts`)

Single Axios instance used by **every** feature. Two rules:

1. **Never instantiate a second Axios client.** New API calls go on
   this instance so the interceptor can attach the Clerk JWT.
2. **Never call `fetch` directly for the web API.** Axios normalizes
   error shapes (see `err.response?.status`, `err.response?.data`)
   and our error-handling patterns assume that envelope.

The interceptor:

```ts
apiClient.interceptors.request.use(async (config) => {
  if (getToken) {
    const token = await getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

The interceptor is activated by `setTokenGetter(getToken)` from
`AuthGate` after Clerk hydrates. Any API call fired before that
wiring completes will ship without an `Authorization` header and get
a 401 back — which is why `AuthGate` gates the redirect to `(tabs)`
on `membershipQuery.isSuccess` rather than a timer.

### Base URL

`EXPO_PUBLIC_API_URL` drives the base URL, with a fallback to
`http://localhost:3000/api`. Known-good values:

| Target | Value |
|--------|-------|
| iOS simulator | `http://localhost:3000/api` |
| Android emulator | `http://10.0.2.2:3000/api` |
| Physical device | `http://<mac-lan-ip>:3000/api` |
| Production | `https://<deployed-origin>/api` |

---

## 8. Server state: TanStack Query

`lib/query-client.ts` configures the client once:

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
```

- **`staleTime: 5 min`** — schedule/roster data changes infrequently
  and users are often on cellular. Don't lower this globally.
- **`refetchOnWindowFocus: false`** — mobile has no notion of
  window focus; leave it off.
- **Retry: 2** — we want one retry on transient 5xx, not aggressive
  spinning.

### Query key conventions

```ts
["auth", "membership"]
["schedule", "week", weekStart.toISOString()]
["exchange", "available"]
["time-off", "requests", staffId]
```

Top-level prefix = feature name; secondary segments = subresource;
dates are ISO strings so the cache key is stable. Keep these
consistent so invalidation stays predictable:

```ts
queryClient.invalidateQueries({ queryKey: ["schedule"] });
```

### Mutations

Mutations use `useMutation` from TanStack Query and manually call
`queryClient.invalidateQueries` in `onSuccess`. No auto-refetch — the
5-minute stale time would otherwise hide fresh data. Example:

```ts
const pickupMutation = useMutation({
  mutationFn: pickUpShift,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["exchange"] });
  },
});
```

---

## 9. Local state: Zustand

Zustand is reserved for **client-only, cross-screen** state. Today
the only store is `features/auth/store.ts`, which holds the
`Membership` record and a one-shot `pendingSignInError`.

Rules:

- Do not put server-owned data in Zustand. Use TanStack Query.
- Do not build a "root store" — each feature owns its own `store.ts`
  if it genuinely needs one.
- Do not couple Zustand and Query in both directions. `AuthGate`
  pushes query results *into* Zustand; nothing should read from
  Zustand and write to a query.

---

## 10. Mock data — active technical debt

Today, only `features/auth/api.ts` hits a real endpoint. Every other
feature's `api.ts` returns hardcoded mocks with a `delay()` helper:

- `features/home/api.ts` — next shift, announcements
- `features/schedule/api.ts` — week shifts, shift roster
- `features/exchange/api.ts` — available shifts, my drops,
  pickUpShift, dropShift
- `features/time-off/api.ts` — requests list, submitTimeOffRequest

Every function carries a doc comment describing the planned route
handler that will replace the mock, e.g.:

```ts
// Replace with `apiClient.get("/shifts", { params: { weekStart } })` later.
```

### 10.1 Planned mobile API surface (skeletons live in the repo)

Skeleton route handlers exist under `apps/web/src/app/api/` for every
endpoint the mobile app will eventually call. They each return
`501 Not Implemented` and contain an extensive header comment that
documents auth, request/response shape, and the implementation plan.
**Do not flesh one out without first reading its file-level comment**:

| Mobile call                               | Verb | Web route handler                                                |
|-------------------------------------------|------|------------------------------------------------------------------|
| `fetchNextShift()`                        | GET  | `/api/shifts/next/route.ts`                                      |
| `fetchAnnouncements()`                    | GET  | `/api/announcements/route.ts`                                    |
| `fetchWeekShifts(weekStart)`              | GET  | `/api/shifts/route.ts`                                           |
| `fetchShiftRoster(shiftId)`               | GET  | `/api/shifts/[shiftId]/roster/route.ts`                          |
| `fetchTimeOffRequests()`                  | GET  | `/api/time-off/route.ts`                                         |
| `submitTimeOffRequest(input)`             | POST | `/api/time-off/route.ts`                                         |
| `fetchAvailableShifts()`                  | GET  | `/api/exchange/available/route.ts`                               |
| `fetchMyDroppedShifts()`                  | GET  | `/api/exchange/mine/route.ts`                                    |
| `pickUpShift(exchangeId)`                 | POST | `/api/exchange/[exchangeId]/pickup/route.ts`                     |
| `dropShift(shiftId)`                      | POST | `/api/shifts/[shiftId]/drop/route.ts`                            |
| `fetchMembership()` (already shipped)     | GET  | `/api/me/membership/route.ts`                                    |

Both **Announcements** and **ExchangeShift** now have full backend
foundations on the web side (model + service + shared DTO + Zod
schemas — see [01-data-models.md](./01-data-models.md) for the
schema and lifecycle). The route handlers under `/api/announcements`,
`/api/exchange/*`, and `/api/shifts/[shiftId]/drop` remain 501
placeholders; their file headers describe the (now small)
implementation step that delegates to the existing service.

When you wire a feature to a real endpoint:

1. Delete the `delay(...)` + mock factory.
2. Replace the body with `apiClient.get/post(...)` (Axios, not
   fetch).
3. Use the DTOs from `@sous/types` as the response shape — do not
   define a mobile-local type that shadows them.
4. Update the web app's `apps/web/src/app/api/` route handler (and
   service) to match. Route handlers used by mobile are the only
   `app/api/*` routes you should add — see
   [05-api-and-testing.md](./05-api-and-testing.md).
5. Invalidate the relevant TanStack Query keys on mutation success.

Do not pretend the mocks are real. If a screen is wired to mocks,
its PR description must say so, and the corresponding server
endpoint task should be filed.

---

## 11. Styling: NativeWind + tokens

NativeWind v5 compiles Tailwind classes to React Native styles at
build time via Metro. The mobile app shares the "Warm Industrial"
design tokens with the web app:

- `apps/mobile/global.css` defines CSS variables (`--background`,
  `--primary`, `--foreground`, etc.) for light and dark mode.
- The web app uses the same variable names in
  `apps/web/src/app/globals.css` — **keep them in sync**. A component
  styled `bg-primary text-primary-foreground` should look visually
  matched on both platforms.
- Dark mode is driven by `@media (prefers-color-scheme: dark)` in
  CSS and by `useColorScheme()` in JS.

When to use NativeWind vs. `StyleSheet.create`:

- **NativeWind** for layout, spacing, color tokens, typography — the
  vast majority of UI.
- **`StyleSheet.create` or inline style** for absolute positioning,
  dimensions that must be numeric (e.g. `ActivityIndicator` overlay),
  or platform-specific tweaks NativeWind doesn't cover.

Do not import `react-native-paper` or any other large RN UI kit. The
design system is intentionally bespoke and small.

---

## 12. Environment variables

Expo only exposes variables prefixed with `EXPO_PUBLIC_` to the
client bundle. Anything unprefixed is stripped from the JS output.

The mobile app reads (see `.env.example`):

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Same Clerk instance as web |
| `EXPO_PUBLIC_API_URL` | Base URL for `apiClient` |

Both are populated by the `bootstrap-env` skill from `MOBILE_*`
prefixed host variables. See `.cursor/skills/bootstrap-env/SKILL.md`.
Add new mobile env vars with the `EXPO_PUBLIC_` prefix and update
`.env.example` in the same PR.

Clerk secrets (the **secret key**) must never land in the mobile
bundle. They stay on the web app.

---

## 13. Running the app

```bash
cd apps/mobile
npm run dev        # expo start
npm run ios        # expo start --ios
npm run android    # expo start --android
npm run web        # expo start --web (dev convenience only)
```

From the repo root, Turborepo pipelines run workspace scripts:

```bash
npm run dev          # starts web + mobile + any other dev tasks
npm run lint         # runs lint across workspaces
```

The **iOS simulator and Android emulator cannot reach each other or
the host the same way**. Always check `EXPO_PUBLIC_API_URL` before
debugging "it works on my simulator but not on my phone."

---

## 14. Testing

Mobile testing is **not wired up yet**. Jest + React Native Testing
Library is the intended stack when we start writing tests. Until
then, verification is manual via the iOS simulator and the web app
at `localhost:3000` for the backend.

When adding tests later:

- Component tests go next to the component, `*.test.tsx`.
- API-client tests mock Axios via `jest.mock("axios")` rather than
  hitting a live server.
- Integration tests that need Clerk should stub `useAuth` /
  `useClerk` rather than hitting real Clerk.

---

## 15. Mobile-specific gotchas

- **`react-native-reanimated`** must be imported at the top of
  `app/_layout.tsx` (it already is). Do not move or remove that
  import — Reanimated's Babel plugin requires it.
- **SecureStore** throws on the web platform. If you ever enable
  `--web`, branch on `Platform.OS` before calling SecureStore.
- **NativeWind** classes are static — no template string
  interpolation of class names (`className={\`text-${color}\`}` will
  silently not compile). Use `clsx` / conditional ternaries instead.
- **React Navigation theme vs. NativeWind theme** are separate.
  `ThemeProvider` in `_layout.tsx` drives the navigator chrome;
  NativeWind drives your screens. Pick both via the same
  `useColorScheme()` call so they stay in sync.
- **Don't dynamic-import `@sous/types`.** Metro's resolver gets
  upset. Use a static `import type { ... } from "@sous/types"`.

---

## 16. Files to know

- `apps/mobile/app/_layout.tsx` — provider tree + AuthGate
- `apps/mobile/app/(auth)/sign-in.tsx` — entry screen
- `apps/mobile/app/(tabs)/_layout.tsx` — tab bar
- `apps/mobile/lib/api-client.ts` — Axios instance
- `apps/mobile/lib/query-client.ts` — TanStack client
- `apps/mobile/lib/token-cache.ts` — SecureStore adapter
- `apps/mobile/features/auth/api.ts` — only real network call today
- `apps/mobile/features/auth/store.ts` — Zustand auth store
- `apps/mobile/global.css` — design tokens
- `apps/web/src/app/api/me/membership/route.ts` — server counterpart
- `packages/types/src/**` — DTOs and Zod schemas shared with web
