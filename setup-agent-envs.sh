#!/usr/bin/env bash
# =============================================================================
# setup-agent-envs.sh
# -----------------------------------------------------------------------------
# Materialize per-app env files from host environment variables.
#
#   WEB_*    → apps/web/.env.local   (Next.js reads this automatically)
#   MOBILE_* → apps/mobile/.env       (Expo reads this automatically)
#
# Prefixes are stripped when written. For example:
#
#   export WEB_MONGODB_URI="mongodb+srv://..."
#   export MOBILE_EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
#
# yields:
#
#   apps/web/.env.local:       MONGODB_URI=mongodb+srv://...
#   apps/mobile/.env:          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
#
# This script is called by the `bootstrap-env` skill and is safe to run
# repeatedly — each invocation rewrites both files from scratch.
#
# See .cursor/skills/bootstrap-env/SKILL.md for full agent instructions.
# =============================================================================

set -euo pipefail

# Resolve the directory this script lives in so we can be called from anywhere.
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$_SCRIPT_DIR"

# Internal variables are intentionally underscore-prefixed so they do not
# collide with WEB_* / MOBILE_* host variables that the script materializes.
_WEB_FILE="apps/web/.env.local"
_MOBILE_FILE="apps/mobile/.env"

# -----------------------------------------------------------------------------
# Required variable lists (enforced; missing ones abort the script).
# Keep these in sync with .cursor/skills/bootstrap-env/SKILL.md.
# -----------------------------------------------------------------------------
REQUIRED_WEB_VARS=(
  "WEB_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
  "WEB_CLERK_SECRET_KEY"
  "WEB_CLERK_WEBHOOK_SECRET"
  "WEB_MONGODB_URI"
  "WEB_OPENAI_API_KEY"
  "WEB_NEXT_PUBLIC_APP_URL"
)

REQUIRED_MOBILE_VARS=(
  "MOBILE_EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"
  "MOBILE_EXPO_PUBLIC_API_URL"
)

# -----------------------------------------------------------------------------
# Optional variables (recognised but not enforced).
#
# These are intentionally NOT in REQUIRED_WEB_VARS: the web app boots, builds,
# typechecks, and serves the vast majority of routes without them. Each group
# is read lazily and only the specific feature degrades when it is unset:
#
#   Object storage (Cloudflare R2) — attachments/uploads only. Read lazily in
#   apps/web/src/lib/storage/r2.ts; the app boots fine without these. A request
#   that actually uploads a file throws until they are provided. Inject these as
#   host secrets only when working on upload/attachment features.
#     WEB_R2_ACCOUNT_ID        — Cloudflare account id
#     WEB_R2_ACCESS_KEY_ID     — R2 API token access key id
#     WEB_R2_SECRET_ACCESS_KEY — R2 API token secret access key
#     WEB_R2_BUCKET            — bucket name
#     WEB_R2_PUBLIC_URL        — public base URL (pub-<hash>.r2.dev or custom)
#
#   Notifications — when unset the web dispatcher silently no-ops the matching
#   channel rather than throwing. Push without EXPO_ACCESS_TOKEN still works
#   (anonymous Expo rate limit); email without RESEND_API_KEY disables outbound
#   mail entirely.
#     WEB_RESEND_API_KEY       — Resend transactional API key
#     WEB_RESEND_FROM          — Default From address (e.g. "Sous <…>" )
#     WEB_EXPO_ACCESS_TOKEN    — Expo push access token (raises rate limits)
#
#   Billing (Stripe) — checkout/subscription routes only.
#     WEB_STRIPE_SECRET_KEY, WEB_STRIPE_WEBHOOK_SECRET,
#     WEB_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (+ price ids)
#
#   Constraint solver — schedule generation only; defaults to localhost:8000.
#     WEB_CP_SOLVER_URL
#
# RECOMMENDED_WEB_GROUPS below drives a non-fatal heads-up (not an abort) so an
# agent can see at a glance which optional features are currently disabled.
# -----------------------------------------------------------------------------

# Representative variable per optional feature group. If the representative is
# unset we print a single soft-warning line naming the group. This never aborts.
RECOMMENDED_WEB_GROUPS=(
  "WEB_R2_ACCOUNT_ID:object storage / attachments (Cloudflare R2)"
  "WEB_RESEND_API_KEY:outbound email (Resend)"
  "WEB_STRIPE_SECRET_KEY:billing (Stripe)"
)

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

# Print a coloured status line without depending on tput; keep it ASCII-safe.
log() {
  printf '[setup-agent-envs] %s\n' "$*"
}

fail() {
  printf '[setup-agent-envs] ERROR: %s\n' "$*" >&2
  exit 1
}

# Ensure the two app directories exist before we try to write into them.
require_dir() {
  local dir="$1"
  [ -d "$dir" ] || fail "Expected directory not found: $dir (run from monorepo root)"
}

# Enforce that every name in the list is present and non-empty in the env.
check_required() {
  local label="$1"
  shift
  local missing=()
  local name
  for name in "$@"; do
    if [ -z "${!name-}" ]; then
      missing+=("$name")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    log "Missing required $label variable(s):"
    for name in "${missing[@]}"; do
      printf '  - %s\n' "$name" >&2
    done
    fail "Aborting. Please inject the missing variables and re-run."
  fi
}

# Print a non-fatal heads-up for each optional feature group whose
# representative variable is unset. Never aborts — these features simply stay
# disabled until the matching secrets are injected.
warn_recommended() {
  local entry name desc
  local any=0
  for entry in "$@"; do
    name="${entry%%:*}"
    desc="${entry#*:}"
    if [ -z "${!name-}" ]; then
      if [ "$any" -eq 0 ]; then
        log "Optional feature groups disabled (inject the secrets to enable):"
        any=1
      fi
      printf '  - %s (set %s* to enable)\n' "$desc" "$name"
    fi
  done
}

# Warn (do not abort) only when the running Node major is OUTSIDE the supported
# range declared in package.json "engines" (>=22.12.0 <25). The Cloud Agent
# runtime ships Node 22 LTS at /exec-daemon/node, which is supported, so this
# stays quiet there. It only speaks up when Node is genuinely too old/new —
# avoiding the misleading "wrong Node" nag that previously burned agent tokens.
#
# Keep _NODE_MIN_MAJOR / _NODE_MAX_MAJOR in sync with package.json "engines".
_NODE_MIN_MAJOR=22
_NODE_MAX_MAJOR=24
check_node_version() {
  command -v node >/dev/null 2>&1 || {
    log "WARNING: node is not on PATH. This repo needs Node ${_NODE_MIN_MAJOR}.x-${_NODE_MAX_MAJOR}.x."
    return 0
  }

  local current major
  current="$(node --version | sed 's/^v//')"
  major="${current%%.*}"

  if [ "$major" -lt "$_NODE_MIN_MAJOR" ] 2>/dev/null; then
    log "WARNING: Node $current is below this repo's supported floor (Node ${_NODE_MIN_MAJOR})."
    log "         'npm install' and 'next build' may fail. If nvm is available:"
    log "         'nvm install ${_NODE_MIN_MAJOR} && nvm use ${_NODE_MIN_MAJOR}'."
  elif [ "$major" -gt "$_NODE_MAX_MAJOR" ] 2>/dev/null; then
    log "NOTE: Node $current is newer than the validated range (<=${_NODE_MAX_MAJOR}.x). Proceed, but watch for toolchain surprises."
  fi
}

# Write a single KEY=VALUE line, escaping the value for safety.
#
# We wrap the value in double quotes and escape embedded backslashes, dollar
# signs, double quotes, and backticks so a value like
#   postgres://user:p@ss"word$@/db
# round-trips intact through dotenv parsers (Next.js / Expo both use dotenv).
write_kv() {
  local file="$1"
  local key="$2"
  local value="$3"

  local escaped="$value"
  escaped="${escaped//\\/\\\\}"
  escaped="${escaped//\$/\\\$}"
  escaped="${escaped//\`/\\\`}"
  escaped="${escaped//\"/\\\"}"

  printf '%s="%s"\n' "$key" "$escaped" >> "$file"
}

# Emit a stable banner so humans know the file is auto-generated.
write_banner() {
  local file="$1"
  local app="$2"
  local source_prefix="$3"

  {
    printf '# ---------------------------------------------------------------\n'
    printf '# %s — generated by setup-agent-envs.sh\n' "$app"
    printf '# Source: %s* environment variables on the cloud agent host.\n' "$source_prefix"
    printf '# Do NOT hand-edit. Re-run ./setup-agent-envs.sh to refresh.\n'
    printf '# Generated at %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf '# ---------------------------------------------------------------\n'
  } > "$file"
}

# Walk every env var starting with the given prefix, strip the prefix, and
# append each one to the target file. Returns the count via stdout.
materialize_prefixed_vars() {
  local prefix="$1"
  local file="$2"
  local count=0

  # `compgen -v` lists every shell variable name. Filter by prefix and write
  # each pair. Use a while-read loop so we don't blow up on odd values.
  local name
  while IFS= read -r name; do
    case "$name" in
      "${prefix}"*)
        local stripped="${name#${prefix}}"
        # Skip internal bash variables that happen to start with the prefix
        # (e.g. WEB_* would never collide, but future-proof against shells
        # that populate upper-case readonly vars).
        [ -z "$stripped" ] && continue
        local value="${!name-}"
        write_kv "$file" "$stripped" "$value"
        count=$((count + 1))
        ;;
    esac
  done < <(compgen -v | sort)

  printf '%d\n' "$count"
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

log "Bootstrapping per-app env files in $_SCRIPT_DIR"

require_dir "apps/web"
require_dir "apps/mobile"

check_node_version

check_required "WEB_"    "${REQUIRED_WEB_VARS[@]}"
check_required "MOBILE_" "${REQUIRED_MOBILE_VARS[@]}"

warn_recommended "${RECOMMENDED_WEB_GROUPS[@]}"

# --- Web ---------------------------------------------------------------------
log "Writing $_WEB_FILE"
write_banner "$_WEB_FILE" "Sous Web (Next.js)" "WEB_"
_WEB_COUNT="$(materialize_prefixed_vars "WEB_" "$_WEB_FILE")"
log "  wrote $_WEB_COUNT variable(s) to $_WEB_FILE"

# --- Mobile ------------------------------------------------------------------
log "Writing $_MOBILE_FILE"
write_banner "$_MOBILE_FILE" "Sous Mobile (Expo)" "MOBILE_"
_MOBILE_COUNT="$(materialize_prefixed_vars "MOBILE_" "$_MOBILE_FILE")"
log "  wrote $_MOBILE_COUNT variable(s) to $_MOBILE_FILE"

log "Done. Apps are now configured."
log "Next: run 'npm install' from the monorepo root."
