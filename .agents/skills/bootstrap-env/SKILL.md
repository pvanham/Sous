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

Also confirm the active Node version satisfies the repo's `.node-version`
(`>=24.3.0 <25`, currently `24.15.0`):

```bash
node -v   # must report v24.x
```

If the host defaults to an older Node (some cloud-agent images ship Node 22),
the web app may still boot but the Expo **web** bundler will fail to render
(e.g. `Cannot use 'import meta' outside a module`). Select Node 24 before
continuing — e.g. with nvm: `nvm install 24.15.0 && nvm use 24.15.0`. The
durable fix is to bake Node 24 into the cloud-agent base image via an env
setup agent.

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
likely environmental (wrong Node version, missed install step) — rerun
step 3 before assuming it's a code bug.

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
written through unchanged. Common examples:

- `WEB_CP_SOLVER_URL` → `CP_SOLVER_URL` (defaults to `http://localhost:8000`)
- `WEB_STRIPE_SECRET_KEY`, `WEB_STRIPE_WEBHOOK_SECRET`,
  `WEB_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (+ price IDs) for billing
- `WEB_RESEND_API_KEY` → `RESEND_API_KEY` (transactional email; without
  it the dispatcher silently skips email sends)
- `WEB_RESEND_FROM` → `RESEND_FROM` (default From, e.g.
  `"Sous <onboarding@resend.dev>"` for dev; verified domain in prod)
- `WEB_EXPO_ACCESS_TOKEN` → `EXPO_ACCESS_TOKEN` (raises Expo push rate
  limits; optional — anonymous push still works)
- `WEB_R2_ACCOUNT_ID`, `WEB_R2_ACCESS_KEY_ID`, `WEB_R2_SECRET_ACCESS_KEY`,
  `WEB_R2_BUCKET`, `WEB_R2_PUBLIC_URL` → Cloudflare R2 object storage for
  attachment uploads. **Optional**: `src/lib/storage/r2.ts` reads them lazily,
  only when an attachment upload URL is requested. The app boots, connects to
  Mongo, and serves the full UI without them — only the attachment-upload
  endpoint returns a 500 when they are absent.
- `WEB_SEED_CLERK_USER_ID`, `WEB_SEED_CLERK_USER_ID2` for seed scripts

The cloud host should set any combination of these that the current task
requires. The script does not enforce them.

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
