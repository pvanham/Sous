# AGENTS.md

Guidance for cloud agents working in the Sous monorepo.

## Cursor Cloud specific instructions

### Runtime

- **Node.js 22 LTS** ships at `/exec-daemon/node` (on `PATH`). The repo's
  `engines.node` field targets Node 24+, but the cloud runtime intentionally
  stays on Node 22 — do **not** try to force Node 24.
- **`npm install` may print `EBADENGINE`** warnings; installs and typecheck
  still succeed on Node 22.
- **Docker is unavailable.** The CP-SAT solver runs directly via uvicorn, not
  `docker compose`.

### Bootstrap (automatic on VM startup)

The update script runs:

```bash
bash ./setup-agent-envs.sh
npm install
pip install --break-system-packages -r solver/requirements.txt
```

After startup, confirm per-app env files exist:

- `apps/web/.env.local` (from `WEB_*` host vars)
- `apps/mobile/.env` (from `MOBILE_*` host vars)

If `setup-agent-envs.sh` fails on missing `WEB_R2_*` variables, ask the user
to inject Cloudflare R2 secrets — they are required by the bootstrap script
(see `setup-agent-envs.sh`).

`python3-venv` is a one-time VM system package (not in the update script).

### Starting services (manual — not in update script)

Run each in its own tmux session (see cloud shell rules):

| Service | Command | Port |
|---------|---------|------|
| CP-SAT solver | `cd solver && export PATH="$HOME/.local/bin:$PATH" && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000` | 8000 |
| Web dashboard | `npm run dev:web` (from repo root) | 3000 |
| Mobile (optional) | `npm run dev:mobile` (from repo root) | Expo default |

The web app defaults `CP_SOLVER_URL` to `http://localhost:8000` when unset.

### Verification commands

From repo root:

```bash
npm run typecheck   # all workspaces
npm run lint        # web lint may report pre-existing React Compiler warnings
```

Smoke-test running services:

```bash
curl -s http://127.0.0.1:8000/          # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
cd solver && python3 test_existing_coverage.py   # CP-SAT hello-world
```

### External dependencies (not started locally)

MongoDB Atlas, Clerk, and OpenAI are required for authenticated dashboard
flows and AI features. They are injected via `WEB_*` / `MOBILE_*` host
variables — see `.agents/skills/bootstrap-env/SKILL.md`.

### Monorepo commands

Standard commands are documented in `README.md`. Always `npm install` from the
repo root; never inside `apps/*`.
