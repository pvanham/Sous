# Sous

**AI-assisted kitchen scheduling platform.** A reactive, AI-powered scheduling tool for high-volume kitchens—from intelligent schedule generation to autonomous employee request handling.

---

## Features

- **Staff Management** — Roster management with CSV import, availability tracking, and skill/station assignments
- **Schedule Builder** — Visual schedule grid with Staff View, Time View, and Day/Station View
- **AI-Powered Generation** — Hybrid validator-selector: algorithms enforce hard constraints, LLM selects and explains optimal assignments
- **Constraint Solver** — Optional OR-Tools CP-SAT microservice for optimal staff-to-shift assignments
- **Multi-Location Ready** — Data scoped by organization and location for future multi-tenant support

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router), React 19 |
| Styling | Tailwind CSS v4, shadcn/ui |
| Database | MongoDB Atlas, Mongoose 9 |
| Auth | Clerk |
| State | TanStack Query v5, Server Actions |
| AI | OpenAI API (GPT-4o) |
| Solver | OR-Tools CP-SAT (Python/FastAPI) |

---

## Prerequisites

- **Node.js** 18+
- **MongoDB** (Atlas or local)
- **Clerk** account ([clerk.com](https://clerk.com))
- **OpenAI** API key (for AI schedule generation)

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

This is a monorepo with two app targets. Each has its own `.env.example`
documenting the full set of variables:

- Web: [`apps/web/.env.example`](apps/web/.env.example)
- Mobile: [`apps/mobile/.env.example`](apps/mobile/.env.example)

Copy each to `.env.local` (web) and `.env` (mobile) and fill in real
values. Both apps must point at the **same** Clerk instance so users and
sessions line up across web and mobile.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the web dashboard.

Start the mobile app (Expo) from `apps/mobile`:

```bash
cd apps/mobile
npm run ios      # or: npm run android
```

### 4. (Recommended) Expose the Clerk webhook locally

Clerk sends `user.created` / `user.deleted` events to
`/api/webhooks/clerk`. Those events are what populate `OrganizationMember`
and link `Staff.clerkUserId`. In local dev, Clerk can't reach
`http://localhost:3000` directly, so run a tunnel:

```bash
# Install once: https://ngrok.com/download
ngrok http 3000
```

Copy the forwarding URL (e.g. `https://abcd-1234.ngrok-free.app`) and in
the Clerk Dashboard → **Webhooks**, point the endpoint at
`https://abcd-1234.ngrok-free.app/api/webhooks/clerk`. Copy the signing
secret into `CLERK_WEBHOOK_SECRET` in `apps/web/.env.local`.

> Tip: `/api/me/membership` will **self-heal** missing memberships from
> the Clerk user's `publicMetadata` or a pending invitation even without
> the webhook running. The webhook is still required for `user.deleted`
> cascade deletes.

### 5. Create a test staff account

1. Sign up for the web app and complete the onboarding to become an owner
   of a new organization.
2. In the dashboard, add a staff member and send them an invitation (or
   invite yourself at a different email address).
3. Open the invitation email and click the link — it lands on
   `/sign-up?__clerk_ticket=...`. Set a password; the sign-up page uses
   Clerk's `ticket` strategy so the invitation's metadata (role, org,
   location) is copied onto the new user.
4. Open the mobile app and sign in with the same email + password.

If sign-up was completed without the ticket (e.g. plain `/sign-up`), the
first call to `/api/me/membership` will detect the pending invitation for
that email, provision the `OrganizationMember`, and revoke the
invitation — so the user can still be unblocked on first mobile sign-in.

---

## Optional: Constraint Solver

The CP-SAT solver provides optimal staff-to-shift assignments. Run it via Docker:

```bash
docker compose up solver
```

The solver listens on `http://localhost:8000`. The Next.js app uses `CP_SOLVER_URL` (default: `http://localhost:8000`) to call it.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test:phase-1` | Phase 1 verification |
| `npm run test:phase-2` | Phase 2 verification |
| `npm run seed:ai-test` | Seed data for AI schedule generation tests |
| `npm run seed:favorable` | Seed favorable schedule test data |

---

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Sign-in, public routes
│   ├── (dashboard)/        # Manager dashboard (schedule, staff, labor, inbox, settings)
│   ├── (staff)/            # Staff portal (my-shifts, availability)
│   └── api/webhooks/       # Twilio, Clerk webhooks
├── components/
│   ├── ui/                 # shadcn/ui primitives
│   └── shared/             # Providers, theme toggle
├── lib/                    # DB, auth, AI client, validations
└── server/
    ├── actions/            # Server Actions (auth, validation, service calls)
    ├── services/           # Business logic, Mongoose models
    └── models/             # Mongoose schemas
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full 3-layer architecture and conventions.

---

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Codebase structure, patterns, conventions
- [plans/MASTER_ROADMAP.md](./plans/MASTER_ROADMAP.md) — Build plan and phase status
