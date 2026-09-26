---
name: bootstrap-env
description: >-
  Mandatory initialization procedure for CLOUD agent sessions only on the Sous
  monorepo. Materializes per-app environment files (apps/web/.env.local and
  apps/mobile/.env) from globally provided WEB_* and MOBILE_* variables,
  installs dependencies, and verifies the workspace is ready before the agent
  touches any code. Use this skill immediately at the start of a fresh CLOUD
  agent session or whenever environment variables, .env files, or
  setup-agent-envs.sh are mentioned.
---

# Bootstrap Environment — Cloud Agent Initialization

> **Local agents: skip this skill entirely.**
> If you are running inside Cursor IDE on a developer's machine, `.env.local`
> and `.env` files already exist and the environment is already configured.
> Running this script locally will overwrite those files with incomplete values.
> Proceed directly to the user's task.

This is the **first thing** every **cloud agent** must do in a fresh session on
the Sous monorepo. No other work — reading code, running commands, editing
files — should happen before this procedure completes successfully.

Sous is a two-app monorepo (Next.js web + Expo mobile) that share a single
Clerk instance, a single MongoDB cluster, and a common API surface. The two
apps have **distinct environment files** with different prefixes, so the
agent host's global environment variables must be split and materialized
into each app before `npm install` or any dev server will work.

---

## Why this exists

Cloud agent runtimes inject environment variables at the workspace level —
they do **not** carry `.env.local` or `.env` files from the developer's
machine. Without this skill, the agent would:

- Read `MONGODB_URI` in the shell but `apps/web/next dev` would still fail,
  because Next.js only loads `.env.local` under the app root.
- See `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in the shell but Expo Metro would
  not inline it into the bundle, because Expo only reads `apps/mobile/.env`
  (and `.env.local`) under the app root.
- Commit a real `.env.local` accidentally. (The repo `.gitignore` ignores
  `.env*` except `.env.example`, but we still generate files with a banner
  that marks them as generated.)

The `setup-agent-envs.sh` script at the repo root handles this translation:
it takes `WEB_*` and `MOBILE_*` variables from the environment and writes
them, un-prefixed, into the correct per-app file.

---

## Procedure

Run these steps in order. **Do not proceed past a failing step.**

### 1. Sanity-check the workspace

From the monorepo root, confirm the two app directories exist:

```bash
test -d apps/web && test -d apps/mobile && echo "Workspace OK"
```

If that command fails, the agent is in the wrong working directory. Stop
and report.

### 2. Run the env bootstrap script

```bash
bash ./setup-agent-envs.sh
```

The script:

- Reads every `WEB_*` environment variable, strips the `WEB_` prefix, and
  writes the result to `apps/web/.env.local`.
- Reads every `MOBILE_*` environment variable, strips the `MOBILE_` prefix,
  and writes the result to `apps/mobile/.env`.
- Prints a summary of how many variables were written to each file.
- Exits non-zero if required variables are missing (see
  [Required variables](#required-variables) below).
- Never logs the **values** of secrets, only the **names**.

If the script fails with a `Missing required variable` error, report the
list of missing names to the user and stop. Do not attempt to fabricate or
guess values.

### 3. Install dependencies

The monorepo uses npm workspaces with Turborepo. Install from the root:

```bash
npm install
```

This installs dependencies for **all** workspaces (`apps/web`, `apps/mobile`,
`packages/config`, `packages/types`) in one pass. Do not run `npm install`
inside an app directory — it will fight the workspace resolver.

### 4. (Optional) Verify both apps typecheck

This is a cheap smoke test that the env + install worked. It takes ~30s.

```bash
npm run typecheck
```

If typecheck fails on a file the agent hasn't touched, the issue is most
likely environmental (missed install step) — rerun step 3 before assuming
it's a code bug. Note the active Node will be 22 on the cloud VM; that is
supported and expected (see "Node runtime" below), so an `EBADENGINE`
warning during `npm install` is harmless and not the cause.

### 5. Confirm readiness

Report back to the user (or to the calling workflow) that bootstrap
succeeded and list:

- How many variables were written to each app
- Whether `npm install` completed cleanly
- Whether `npm run typecheck` passed

The agent is now free to proceed with the user's actual task.

---

## Required variables

`setup-agent-envs.sh` enforces a minimum set per app. If any are missing,
the script exits non-zero and the agent must stop.

### Web (`apps/web/.env.local`) — required

| Prefixed (env) | Written as (file) | Purpose |
|----------------|-------------------|---------|
| `WEB_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend key |
| `WEB_CLERK_SECRET_KEY`                  | `CLERK_SECRET_KEY`                  | Clerk backend key |
| `WEB_CLERK_WEBHOOK_SECRET`              | `CLERK_WEBHOOK_SECRET`              | Verifies Clerk `user.created` webhook |
| `WEB_MONGODB_URI`                       | `MONGODB_URI`                       | Mongo Atlas connection string |
| `WEB_OPENAI_API_KEY`                    | `OPENAI_API_KEY`                    | OpenAI key for chat + generation |
| `WEB_NEXT_PUBLIC_APP_URL`               | `NEXT_PUBLIC_APP_URL`               | e.g. `http://localhost:3000` |

### Mobile (`apps/mobile/.env`) — required

| Prefixed (env) | Written as (file) | Purpose |
|----------------|-------------------|---------|
| `MOBILE_EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Must match the web app's Clerk instance |
| `MOBILE_EXPO_PUBLIC_API_URL`               | `EXPO_PUBLIC_API_URL`               | Base URL the mobile app hits for the web API |

### Optional variables

Any additional `WEB_*` or `MOBILE_*` variable beyond the required set is
written through unchanged. None of these block bootstrap — each one only
enables a specific feature, and the app boots/builds/typechecks without them.
Common examples:

- `WEB_CP_SOLVER_URL` → `CP_SOLVER_URL` (defaults to `http://localhost:8000`)
- Cloudflare R2 object storage (attachments/uploads **only**). Read lazily in
  `apps/web/src/lib/storage/r2.ts`, so the app boots fine without them; a
  request that actually uploads a file throws until they are set. Inject these
  only when working on upload/attachment features:
  `WEB_R2_ACCOUNT_ID`, `WEB_R2_ACCESS_KEY_ID`, `WEB_R2_SECRET_ACCESS_KEY`,
  `WEB_R2_BUCKET`, `WEB_R2_PUBLIC_URL`
- `WEB_STRIPE_SECRET_KEY`, `WEB_STRIPE_WEBHOOK_SECRET`,
  `WEB_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (+ price IDs) for billing
- `WEB_RESEND_API_KEY` → `RESEND_API_KEY` (transactional email; without
  it the dispatcher silently skips email sends)
- `WEB_RESEND_FROM` → `RESEND_FROM` (default From, e.g.
  `"Sous <onboarding@resend.dev>"` for dev; verified domain in prod)
- `WEB_EXPO_ACCESS_TOKEN` → `EXPO_ACCESS_TOKEN` (raises Expo push rate
  limits; optional — anonymous push still works)
- `WEB_SEED_CLERK_USER_ID`, `WEB_SEED_CLERK_USER_ID2` for seed scripts

The cloud host should set any combination of these that the current task
requires. The script does not enforce them — it prints a one-line, non-fatal
heads-up naming each optional feature group that is currently disabled.

---

## Cloud host requirements & known constraints

These are properties of the Cloud Agent VM itself (not the repo). They are
documented here so agents don't waste tokens rediscovering them every run.
None of them block install/typecheck/dev-boot; they bite only when a task
reaches the relevant external system.

### Node runtime: 22 LTS, and you can't easily change it

The Cloud Agent runtime ships Node 22 LTS as `/exec-daemon/node` and puts it
near the **front** of `PATH`, ahead of `nvm`. As a result, `nvm install 24 &&
nvm use 24` does **not** change the active `node` — `/exec-daemon/node` (Node
22) still wins. Do **not** burn time trying to force Node 24.

This is fine: `package.json` "engines" is `>=22.12.0 <25`, and install,
`npm run typecheck`, `next dev`/`next build`, and the Expo/Metro bundler are
all verified to work on Node 22. (`.node-version` still pins 24.15.0 for local
developers; the cloud runtime ignores it.)

### MongoDB Atlas IP allowlist (the one true blocker for DB work)

The Atlas cluster behind `MONGODB_URI` enforces an IP allowlist. The Cloud
Agent VM egresses through a rotating AWS NAT pool, so its IP is **not**
allowlisted by default and is not stable between runs. Any code path that
touches Mongo — most Server Actions, seed scripts (`npm run seed:*`),
schedule-generation tests — fails with:

> `MongooseServerSelectionError: Could not connect to any servers in your
> MongoDB Atlas cluster ... IP that isn't whitelisted`

The web app still **boots and serves** without DB access (routes that don't
hit Mongo return 200). To unblock DB work the Atlas project must allow the
agent's egress — see the manual-action report in the PR / issue. There is no
in-repo fix for this; it is an Atlas dashboard change.

### Docker is not installed — run the solver directly

`docker` / `docker compose` are **not** available on the VM, so the documented
`docker compose up solver` path does not work here. The CP-SAT solver still
runs natively (Python 3.12 is present):

```bash
cd solver
pip install --break-system-packages -r requirements.txt   # venv/ensurepip is unavailable
python3 -m pytest -q                                        # 4 tests, ~1s
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000      # serves GET / -> {"status":"ok"}
```

The web app reaches it at `CP_SOLVER_URL` (default `http://localhost:8000`),
so booting it on port 8000 wires schedule generation to a live solver without
Docker.

---

## Idempotency and safety

- The script **overwrites** `apps/web/.env.local` and `apps/mobile/.env` on
  every run. Running it twice is safe and is the expected way to refresh
  the env after a change to the host's variables.
- Both generated files carry a `# Generated by setup-agent-envs.sh` banner
  and a timestamp so humans know they shouldn't hand-edit them.
- Both paths are already covered by `.gitignore` (`.env*` except
  `.env.example`). The script never touches `.env.example` files.
- The script is **read-only** against the host environment — it only
  reads, it never mutates, `env`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Missing required variable: WEB_MONGODB_URI` | Host didn't inject this secret | Ask the user / workflow to add it and re-run the skill |
| `MongooseServerSelectionError ... isn't whitelisted` at runtime | VM egress IP not on the Atlas allowlist | Not a code bug — the Atlas project must allow the agent egress. See "MongoDB Atlas IP allowlist" above. |
| `EBADENGINE ... required: node >=...` during `npm install` | Cloud VM ships Node 22; repo's preferred local Node is 24 | Harmless warning. Node 22 is supported; do not try to switch Node (see "Node runtime"). |
| `docker: command not found` when starting the solver | Docker isn't installed on the VM | Run the solver natively with pip + uvicorn — see "Docker is not installed". |
| `Permission denied` on `./setup-agent-envs.sh` | Script lost its executable bit | `chmod +x setup-agent-envs.sh` or call `bash ./setup-agent-envs.sh` |
| `npm install` pulls Expo native modules on a Linux agent and fails | Expected — mobile native deps aren't needed for web-only work | Use `npm install --workspace=apps/web --workspace=packages/config --workspace=packages/types` to skip mobile |
| `next dev` still can't find `MONGODB_URI` after bootstrap | The dev server was started from the repo root, which does not auto-load `apps/web/.env.local` | `cd apps/web && npm run dev` (or `npm run dev:web` from the root — turbo scopes the env correctly) |
| Mobile app throws `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is undefined` at boot | Expo was started before `.env` existed | Restart Metro (`cd apps/mobile && npm run dev`) — Expo only reads env on cold start |

---

## When to re-run this skill

Re-run `bash ./setup-agent-envs.sh` (step 2 only) whenever:

- The user reports that a new env var was added to the host.
- A new terminal window is opened **and** the agent intends to start a
  dev server from inside an app directory (the shell inherits the host
  env, but the per-app files are what the dev tools actually read).
- `.env.local` or `.env` has been accidentally committed or modified.

You do **not** need to re-run `npm install` unless `package.json` or
`package-lock.json` changed since the last install.
