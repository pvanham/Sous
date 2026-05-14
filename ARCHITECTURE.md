# Sous — Architecture

> Index into the architecture documentation. Start here, then jump
> into whichever document is closest to the change you're making.
> For rules autonomous agents must follow, see
> [docs/architecture/09-cloud-agent-guidelines.md](docs/architecture/09-cloud-agent-guidelines.md)
> and the `.cursor/rules/*.mdc` files.

---

## What Sous is

Sous is a restaurant scheduling platform:

- a **web dashboard** (`apps/web`) — Next.js 16 App Router,
  React 19, TypeScript, Tailwind v4, MongoDB/Mongoose, Clerk auth.
- a **mobile companion** (`apps/mobile`) — Expo SDK 55, React Native
  0.83, NativeWind, TanStack Query, Axios, Clerk Expo.
- an **agentic AI assistant** that reads the dashboard state and
  proposes mutations for the user to confirm (Vercel AI SDK + OpenAI).
- a **CP-SAT scheduling solver** (`solver/`) — Python FastAPI service
  wrapping Google OR-Tools, invoked by the web app to generate
  feasible weekly schedules.
- a **shared types package** (`packages/types`) — Zod schemas and
  DTOs used by both web and mobile.

The monorepo is managed with npm workspaces and Turborepo.

## Repo layout

```
apps/
├── web/       — Next.js 16 dashboard + server actions + AI orchestrator
└── mobile/    — Expo app (staff-facing)

packages/
├── types/     — Zod schemas + DTOs (imported as @sous/types)
└── config/    — shared Tailwind preset, tsconfig, eslint

solver/        — Python FastAPI + OR-Tools CP-SAT microservice

docs/
├── architecture/  — the documents indexed below
├── ai-assistant/  — assistant product spec & playbook
└── roadmap/       — current and near-term roadmap

.cursor/
├── rules/     — auto-attached contextual rules for agents
└── skills/    — invokable agent skills (bootstrap-env, etc.)

.agents/       — mirror of .cursor/ for non-Cursor agent runners
```

## Architecture documents

| # | Document | Scope |
|---|----------|-------|
| 01 | [Data Models](docs/architecture/01-data-models.md) | Mongoose schemas, indexes, multi-tenancy rules |
| 02 | [Layer Patterns](docs/architecture/02-layer-patterns.md) | UI → Action → Service → Model contract |
| 03 | [UI and State](docs/architecture/03-ui-and-state.md) | Components, TanStack Query, forms, Tailwind v4 |
| 04 | [Schedule Generation](docs/architecture/04-schedule-generation.md) | CandidateService + CP-SAT pipeline, async tasks |
| 05 | [API and Testing](docs/architecture/05-api-and-testing.md) | When to use Route Handlers, webhooks, testing strategy |
| 06 | [Framer Motion & Dialogs](docs/architecture/06-framer-motion-dialogs.md) | Flexbox wrapper pattern for Radix dialogs |
| 07 | [AI Orchestrator](docs/architecture/07-ai-orchestrator.md) | Chat, tool registry, RBAC, proposals, OCC, async tasks |
| 08 | [Mobile Architecture](docs/architecture/08-mobile-architecture.md) | Expo app structure, auth, TanStack Query, NativeWind |
| 09 | [Cloud Agent Guidelines](docs/architecture/09-cloud-agent-guidelines.md) | Non-negotiable rules for autonomous agents |
| 10 | [Notifications](docs/architecture/10-notifications.md) | Push (Expo) + email (Resend) dispatcher, categories, mobile registration |

## Quick orientation

- **Changing a Mongo schema?** Start at
  [01-data-models.md](docs/architecture/01-data-models.md).
- **Adding a feature to the web dashboard?** Start at
  [02-layer-patterns.md](docs/architecture/02-layer-patterns.md)
  and read
  [03-ui-and-state.md](docs/architecture/03-ui-and-state.md).
- **Touching the AI assistant?**
  [07-ai-orchestrator.md](docs/architecture/07-ai-orchestrator.md)
  is mandatory reading.
- **Working on schedule generation?**
  [04-schedule-generation.md](docs/architecture/04-schedule-generation.md).
- **Building a mobile screen?**
  [08-mobile-architecture.md](docs/architecture/08-mobile-architecture.md).
- **Adding a push or email notification?**
  [10-notifications.md](docs/architecture/10-notifications.md).
- **You are a cloud agent.** Read
  [09-cloud-agent-guidelines.md](docs/architecture/09-cloud-agent-guidelines.md)
  first, then the document closest to your task.

## Non-negotiables

- Multi-tenancy is enforced in **every** database query via
  `orgId` (+ `locationId` where applicable). See
  [02-layer-patterns.md](docs/architecture/02-layer-patterns.md).
- The AI never mutates the database directly — it builds a
  `StoredProposal` that a human confirms. See
  [07-ai-orchestrator.md](docs/architecture/07-ai-orchestrator.md).
- Shared types live in `packages/types` and have zero runtime
  dependencies on `next`, `mongoose`, or app code.
- Environment variables are materialized by `setup-agent-envs.sh`
  from `WEB_*` / `MOBILE_*` host vars; never hand-edited.
