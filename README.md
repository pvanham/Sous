# Sous

**AI-assisted scheduling for high-volume kitchens.** A web dashboard
for managers, a mobile companion for staff, a CP-SAT solver for
feasible weekly schedules, and an agentic assistant that turns plain
English into reviewed, confirm-before-you-commit changes.

## Features

- **Schedule Builder** — three visual grids (Staff View, Time View,
  Day/Station View), full CRUD with optimistic updates, DRAFT →
  PUBLISHED workflow.
- **Staff Management** — roster, CSV import, availability, skills,
  time-off, invitations.
- **CP-SAT Schedule Generation** — Google OR-Tools CP-SAT (Python +
  FastAPI) proposes an optimal weekly assignment; managers review a
  preview grid before committing.
- **Agentic AI Assistant** — chat with the dashboard from any page;
  the AI proposes mutations as Confirmation Cards that the user must
  approve. OCC-protected, RBAC-gated, permission-filtered per role.
- **Mobile Companion App** — Expo + React Native for staff: home,
  schedule, shift exchange, time-off.
- **Multi-Tenant** — every record is scoped by `orgId` +
  `locationId`. Ready for multi-location switching.
- **Stripe Billing** — subscription management plumbing on
  `Organization`, ready for paywalled tiers.

## Repo layout

```
apps/
├── web/       — Next.js 16 dashboard (App Router, Clerk, Mongo)
└── mobile/    — Expo SDK 54 companion (React Native, NativeWind)

packages/
├── types/     — Zod schemas + DTOs (@sous/types)
└── config/    — shared Tailwind preset, tsconfig, eslint

solver/        — Python FastAPI + OR-Tools CP-SAT microservice

docs/
├── architecture/  — how things work today (start here)
├── history/       — implementation history for shipped phases
└── roadmap/       — forward-looking open work only

.cursor/           — rules + skills for coding agents
.agents/           — mirror of .cursor/ for non-Cursor runners
```

## Tech stack

| Layer | Web | Mobile |
|-------|-----|--------|
| Framework | Next.js 16 (App Router), React 19 | Expo SDK 54, React Native 0.81, React 19 |
| Styling | Tailwind v4, shadcn/ui, Radix, Framer Motion | NativeWind 5, shared Tailwind tokens |
| Data | MongoDB Atlas + Mongoose 9 | Axios + TanStack Query 5 |
| State | TanStack Query 5 + Server Actions | TanStack Query 5 + Zustand 5 |
| Auth | `@clerk/nextjs` 6 | `@clerk/clerk-expo` 2 + `expo-secure-store` |
| AI | Vercel AI SDK (`ai`) for chat; `openai` for one-shot calls | — |
| Billing | Stripe 21 | — |
| Solver | Python FastAPI + OR-Tools (via Docker) | — |

The monorepo is managed with **npm workspaces** and **Turborepo**.

## Prerequisites

- **Node.js** 20+
- **MongoDB** (Atlas or local)
- **Clerk** account — [clerk.com](https://clerk.com)
- **OpenAI** API key (for the AI assistant and CP-SAT objective
  narratives)
- **Docker** (only if you want to run the CP-SAT solver locally)
- **Xcode** or **Android Studio** (only if you plan to run the
  mobile app natively)

## Local setup

### 1. Install dependencies

Always install from the repo root so npm workspaces resolves
correctly.

```bash
npm install
```

### 2. Bootstrap environment variables

The `bootstrap-env` skill generates `apps/web/.env.local` and
`apps/mobile/.env` from `WEB_*` / `MOBILE_*` prefixed host
variables. Run it once per machine (or once per cloud-agent session):

```bash
bash setup-agent-envs.sh
```

Required host variables (minimum):

```bash
# Web — prefixes are stripped when written to apps/web/.env.local
export WEB_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
export WEB_CLERK_SECRET_KEY=sk_test_...
export WEB_CLERK_WEBHOOK_SECRET=whsec_...
export WEB_MONGODB_URI=mongodb+srv://...
export WEB_OPENAI_API_KEY=sk-...
export WEB_NEXT_PUBLIC_APP_URL=http://localhost:3000

# Mobile — prefixes are stripped when written to apps/mobile/.env
export MOBILE_EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...  # same Clerk instance as web
export MOBILE_EXPO_PUBLIC_API_URL=http://localhost:3000/api
```

See `.cursor/skills/bootstrap-env/SKILL.md` for the full list. The
generated `.env` files are git-ignored — never commit them.

Both apps must point at the **same** Clerk instance so users and
sessions line up across web and mobile.

### 3. Run the dev servers

From the repo root, Turborepo runs everything in parallel:

```bash
npm run dev
```

Or target one app:

```bash
npm run dev:web      # Next.js on http://localhost:3000
npm run dev:mobile   # Expo dev server
```

From `apps/mobile`, Expo's native commands also work:

```bash
cd apps/mobile
npm run ios          # iOS simulator
npm run android      # Android emulator
```

### 4. (Recommended) Tunnel the Clerk webhook

Clerk sends `user.created` / `user.deleted` to `/api/webhooks/clerk`
so the dashboard can populate `OrganizationMember` and link
`Staff.clerkUserId`. In local dev, run a tunnel:

```bash
ngrok http 3000
```

In the Clerk Dashboard → **Webhooks**, point the endpoint at
`https://<your-tunnel>/api/webhooks/clerk` and copy the signing
secret into `WEB_CLERK_WEBHOOK_SECRET` before re-running
`setup-agent-envs.sh`.

> `GET /api/me/membership` self-heals missing memberships from the
> Clerk user's `publicMetadata` or a pending invitation, so the
> webhook is not strictly required for first-time sign-ins. It is
> still required for `user.deleted` cascade deletes.

### 5. Create a test staff account

1. Sign up for the web app and complete onboarding to become an
   owner of a new organisation.
2. In the dashboard, invite a staff member to your location.
3. Open the invitation email and click the link — it lands on
   `/sign-up?__clerk_ticket=...`. Set a password; Clerk's ticket
   strategy copies the invitation's metadata (role, org, location)
   onto the new user.
4. Open the mobile app and sign in with the same email + password.

### 6. (Optional) Run the CP-SAT solver

```bash
docker compose up solver
```

The solver listens on `http://localhost:8000`. The web app uses
`CP_SOLVER_URL` (default `http://localhost:8000`) to call it.

## Scripts

Root (Turborepo):

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all workspace dev servers |
| `npm run dev:web` / `dev:mobile` | Start a single dev server |
| `npm run build` | Production build across workspaces |
| `npm run lint` | ESLint across workspaces |
| `npm run typecheck` | TypeScript across workspaces |

Inside `apps/web` (run after `cd apps/web`):

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server |
| `npm run build` / `start` | Production build + serve |
| `npm run seed:ai-test` | Seed fixtures for schedule-generation tests |
| `npm run seed:favorable` | Seed a known-good schedule fixture |

Inside `apps/mobile`:

| Command | Description |
|---------|-------------|
| `npm run dev` | `expo start` |
| `npm run ios` / `android` / `web` | Platform-targeted dev builds |
| `npm run lint` | `expo lint` |

## Documentation

Start here and branch out from the index:

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — top-level index.
- [`docs/architecture/`](./docs/architecture/) — how the system works
  today. One focused document per concern.
- [`docs/history/`](./docs/history/) — implementation history for
  shipped phases. Read for context, not execution.
- [`docs/roadmap/`](./docs/roadmap/) — open work only. No stale
  plans.
- [`docs/architecture/09-cloud-agent-guidelines.md`](./docs/architecture/09-cloud-agent-guidelines.md)
  and [`.cursor/rules/`](./.cursor/rules/) — mandatory reading for
  cloud agents.

## Contributing

- Do not install packages from inside `apps/*`; always install from
  the repo root so workspaces resolve.
- Do not hand-edit `.env*` files; use `setup-agent-envs.sh`.
- Follow the 3-layer contract: UI → Action → Service → Model. See
  [`docs/architecture/02-layer-patterns.md`](./docs/architecture/02-layer-patterns.md).
- AI-originated mutations must go through the propose → confirm →
  execute funnel. See
  [`docs/architecture/07-ai-orchestrator.md`](./docs/architecture/07-ai-orchestrator.md).
