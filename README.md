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

Create a `.env.local` file in the project root with:

```env
# Required
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
MONGODB_URI=mongodb+srv://...
OPENAI_API_KEY=sk-proj-...

# Optional: Constraint solver (defaults to http://localhost:8000)
CP_SOLVER_URL=http://localhost:8000

# Optional: Twilio webhooks (Phase 4)
# TWILIO_AUTH_TOKEN=...
# NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
