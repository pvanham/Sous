# 03 — UI & State Management (Web)

> How `apps/web/src/app/**` is organized, how client components fetch and
> mutate data, and how Zod schemas stay in sync across the
> client/server boundary.

This document is scoped to **the web dashboard**. The mobile app has its
own UI conventions — see [08-mobile-architecture.md](./08-mobile-architecture.md).

---

## 1. Dumb vs. Smart components

| Kind | Location | Characteristics |
|------|----------|-----------------|
| **Dumb** (presentational) | `apps/web/src/components/ui/` | Props in, UI out. No side effects. shadcn/ui primitives live here. |
| **Smart** (feature) | `apps/web/src/app/<route>/_components/*.tsx` | Page-local. Wires actions, queries, and state. |
| **Shared smart** | `apps/web/src/components/shared/**` | Cross-route widgets (e.g. `LocationSwitcher`, `AIAssistantPanel`, `ThemeToggle`, `CustomUserButton`). |
| **Chat UI** | `apps/web/src/components/ai-chat/**` | Chat shell, message bubbles, confirmation cards — used by `AIAssistantPanel`. |
| **Marketing** | `apps/web/src/components/marketing/**` | Public-site-only. No Clerk dependencies. |

### Feature folder convention

Pages co-locate their smart components in an underscore-prefixed
`_components/` folder. The underscore excludes the folder from Next.js
routing:

```
apps/web/src/app/(dashboard)/dashboard/schedule/
├── page.tsx                      Server Component — fetches initial data
└── _components/
    ├── ScheduleGrid.tsx          Orchestrator (client)
    ├── ScheduleHeader.tsx
    ├── ShiftCard.tsx
    ├── ShiftFormDialog.tsx
    └── …                         One file per concern
```

**Rule:** do not hoist a component out of a `_components/` folder into
`src/components/` unless it is used by **another route**. Hoisting
prematurely creates false API surface.

---

## 2. Server Components vs. Client Components

- **Server Components** are the default in Next.js 16. Use them for
  initial rendering, data loading that can be expressed with an
  `await action()` call, and routing. No hooks, no event handlers.
- **Client Components** are marked with `"use client"` at the top of
  the file. Use them for interactive state, event handlers, and
  TanStack Query.

A typical page is a Server Component that passes initial data to a
Client Component, which then uses `useQuery` to stay in sync with
optimistic mutations:

```tsx
// page.tsx (Server Component)
import { listShiftsByWeek } from "@/server/actions/shift.actions";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { getWeekStart } from "@/lib/utils/date";
import { ScheduleGrid } from "./_components/ScheduleGrid";

export default async function SchedulePage({ searchParams }: …) {
  // Resolve the location's configured first day of the week server-side
  // so the very first paint lines up with the configured value before
  // the kitchen-config TanStack query lands. The client component falls
  // back to its cached query for subsequent renders.
  const config = await getKitchenConfig();
  const weekStartsOn =
    config.success && config.data ? config.data.weekStartsOn : "monday";
  const weekStart = getWeekStart(resolveWeekDate(searchParams), weekStartsOn);
  const initial = await listShiftsByWeek({ weekStart });
  return (
    <ScheduleGrid
      initial={initial.success ? initial.data : []}
      weekStart={weekStart}
      initialWeekStartsOn={weekStartsOn}
    />
  );
}
```

```tsx
// _components/ScheduleGrid.tsx (Client Component)
"use client";
import { useQuery } from "@tanstack/react-query";
import { listShiftsByWeek } from "@/server/actions/shift.actions";

export function ScheduleGrid({ initial, weekStart }: …) {
  const { data } = useQuery({
    queryKey: ["shifts", "week", weekStart],
    queryFn: async () => {
      const r = await listShiftsByWeek({ weekStart });
      if (!r.success) throw new Error(r.error);
      return r.data;
    },
    initialData: initial,
  });
  return /* … */;
}
```

---

## 3. TanStack Query v5 conventions

### Query keys

Use **feature-rooted tuples**. The first segment is the feature name; the
rest narrows scope. This makes cache invalidation fast and explicit.

```ts
["shifts"]                      // broad — invalidates all shift caches
["shifts", "week", weekStart]   // narrow — a specific week
["shifts", "staff", staffId]    // narrow — a specific staff member
```

Define query-key factories at the top of the file (or in a shared
`*-keys.ts` when reused):

```ts
const shiftKeys = {
  all: ["shifts"] as const,
  week: (weekStart: Date) => [...shiftKeys.all, "week", weekStart.toISOString()] as const,
  staff: (staffId: string) => [...shiftKeys.all, "staff", staffId] as const,
};
```

### Reading

Always throw inside `queryFn` when the action returns `success: false` —
that's how React Query's `error` state gets populated.

```ts
const { data, isLoading, error } = useQuery({
  queryKey: shiftKeys.week(weekStart),
  queryFn: async () => {
    const result = await listShiftsByWeek({ weekStart });
    if (!result.success) throw new Error(result.error);
    return result.data;
  },
});
```

### Mutating with optimistic updates

The dashboard is optimistic by default. Follow the standard five-step
pattern:

```ts
const createMutation = useMutation({
  mutationFn: createShift,
  onMutate: async (input) => {
    await queryClient.cancelQueries({ queryKey: shiftKeys.week(weekStart) });
    const previous = queryClient.getQueryData<ShiftDTO[]>(shiftKeys.week(weekStart));
    queryClient.setQueryData<ShiftDTO[]>(shiftKeys.week(weekStart), (old = []) => [
      ...old,
      { ...input, id: `temp-${Date.now()}`, /* … */ },
    ]);
    return { previous };
  },
  onError: (_err, _input, context) => {
    queryClient.setQueryData(shiftKeys.week(weekStart), context?.previous);
    toast.error("Failed to create shift");
  },
  onSuccess: (result) => {
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Shift created");
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: shiftKeys.week(weekStart) });
  },
});
```

**Rules:**

- Cancel in-flight queries **before** snapshotting.
- Always roll back on error using the `onMutate` snapshot.
- Toasts go in `onSuccess` and `onError`, never in `onMutate` (that
  fires before the server has done anything).
- Invalidate in `onSettled` so both success and failure resync.

---

## 4. Forms

Forms use **React Hook Form + Zod** via the shadcn `Form` primitive at
`apps/web/src/components/ui/form.tsx`.

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createShiftSchema, type CreateShiftInput } from "@sous/types";

const form = useForm<CreateShiftInput>({
  resolver: zodResolver(createShiftSchema),
  defaultValues: { /* … */ },
});
```

### Shared schemas

The same Zod schema validates the form **and** the Server Action that
receives the form output. Source of truth for cross-app schemas is
`packages/types/src/validations/` (imported as `@sous/types`). Web-only
schemas may live in `apps/web/src/lib/validations/` but must be moved
to `@sous/types` as soon as the mobile app (or a shared tool) starts
consuming them.

---

## 5. Providers tree (`src/components/shared/providers.tsx`)

The root layout wraps everything in a single `<Providers>` component
that mounts:

- `QueryClientProvider` (TanStack Query v5; a stable `QueryClient`
  instance with sensible `staleTime` / `gcTime` defaults).
- `ThemeProvider` from `next-themes` (class-based dark mode).
- `Toaster` from `sonner` (used by the mutation pattern above).

Adding a new top-level provider means editing this file. Do **not**
wrap individual pages or dialogs in their own `QueryClientProvider` —
the cache is app-wide.

---

## 6. Styling — Tailwind v4 with the Warm Industrial palette

Tailwind v4 is **CSS-first**. Tokens live in
`apps/web/src/app/globals.css` as CSS custom properties, surfaced to
Tailwind utilities by the shared preset at
`packages/config/tailwind-preset.ts`.

### Rules

1. **Use semantic utilities** — `bg-card`, `text-foreground`,
   `border-border`, `ring-ring`, `bg-primary`, `text-primary-foreground`.
2. **Never hardcode hex values in markup.** If the token isn't
   expressive enough, add one to `globals.css` and extend the preset —
   don't bypass it.
3. **Dark mode** is class-based (`.dark` on `<html>`), managed by
   `next-themes`. Use the `dark:` variant only when a specific
   override is needed in one direction; most components just read the
   CSS variable and work in both modes.
4. **Radius is token-driven** — `--radius: 0.25rem` (4px, sharp by
   design). Don't override with `rounded-lg` or similar if you want
   something else; change the token.
5. **No shadows in the base style.** The palette relies on borders.
   If you reach for `shadow-*`, reconsider.
6. **Fonts** — `GeistSans` / `GeistMono` are wired in
   `src/app/layout.tsx`. Use `font-sans` / `font-mono` utilities;
   don't re-import.

### Matching tokens on mobile

`apps/mobile/global.css` mirrors the same CSS variables so NativeWind
can bind the same semantic utility names. When you change a token,
change it in both `globals.css` files (or push the change into the
shared preset and have both consume it).

---

## 7. Framer Motion + Radix dialogs

Animating Radix dialogs has sharp edges. The canonical solution is
documented in its own file:
[06-framer-motion-dialogs.md](./06-framer-motion-dialogs.md). Follow
that pattern literally — every existing animated dialog in the app uses
it.

---

## 8. Common gotchas

- **`"use client"` at the top of the file.** A `_components/*.tsx` that
  uses hooks but forgets the directive will fail with a confusing RSC
  serialization error.
- **Stringify dates in query keys.** `Date` objects are reference-compared
  in React Query; stringify to ISO inside the key factory.
- **Do not import server actions into Route Handlers.** Import the
  service directly (route handlers have their own `auth()` path).
- **Shared components go in `src/components/`**, page-local in
  `_components/`. Don't mix.
- **Forms that trigger navigation** should call `router.refresh()` (not
  `router.push()`) when the page is already on the right URL — this
  re-runs the Server Component tree and picks up invalidated data.
