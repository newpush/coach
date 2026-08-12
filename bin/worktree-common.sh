#!/usr/bin/env bash
# Shared configuration and helpers for the coach-wattz worktree scripts.
# Not executable on its own — sourced by worktree-{up,down,warm}.sh.
#
# Ported from bj29's bin/worktree-common.sh (the reference implementation for
# the W-1…W-12 requirements in ~/Develop/hdkiller/docs/guides/project-conventions.md §3E).
# Repo-specific parts: pnpm + Nuxt instead of npm + wasp, a single dev-server
# port per ticket, and databases living on the *existing* shared watts-postgres
# container rather than a container these scripts own.

set -euo pipefail

WT_ROOT="${CW_WT_ROOT:-$HOME/Develop/.worktrees/coach-wattz}"
WARM_DIR="$WT_ROOT/.warm"

# The shared Postgres from the repo's docker-compose.yml. These scripts create
# and drop *per-ticket* databases inside it; the main checkout's database
# ($DB_MAIN) is never created, migrated, seeded or dropped here (W-3).
DB_CONTAINER="${CW_DB_CONTAINER:-watts-postgres}"
DB_PORT="${CW_DB_PORT:-5439}"
DB_USER="${CW_DB_USER:-watts}"
DB_PASS="${CW_DB_PASS:-password}"
DB_MAIN="${CW_DB_MAIN:-watts}"
DB_TEMPLATE="${CW_DB_TEMPLATE:-watts_wt_template}"
DB_QUERY="connection_limit=20&pool_timeout=10&connect_timeout=10"

# Dev-server ports live in a dedicated 3200-3399 band: the main checkout keeps
# 3099 (nuxt.config devServer.port) and Nuxt's own default is 3000, so neither
# can ever be handed to a worktree (W-3).
PORT_BASE="${CW_PORT_BASE:-3200}"
PORT_SPAN=200
# nuxt.config.ts's devServer.port — the main checkout's. Every `localhost:<this>`
# inherited from the main checkout's .env is rewritten to the worktree's port.
MAIN_PORT="${CW_MAIN_PORT:-3099}"

# Dragonfly (watts-dragonfly, :6379) is shared. Each ticket gets its own Redis
# database index 1-15; index 0 stays the main checkout's.
REDIS_CONTAINER="${CW_REDIS_CONTAINER:-watts-dragonfly}"
REDIS_URL_BASE="${CW_REDIS_URL_BASE:-redis://:dragonfly@localhost:6379}"
REDIS_DBS=16

BASE_BRANCH="${CW_BASE_BRANCH:-develop}"

die() {
  printf '\033[31merror:\033[0m %s\n' "$*" >&2
  exit 1
}
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarn:\033[0m %s\n' "$*" >&2; }

# CW-363 -> cw_363 (database-safe)
ticket_slug() { printf '%s' "$1" | tr '[:upper:]-' '[:lower:]_'; }
ticket_db() { printf 'watts_wt_%s' "$(ticket_slug "$1")"; }

# CW-363 -> 363
ticket_number() {
  local n="${1##*-}"
  [[ "$n" =~ ^[0-9]+$ ]] || die "ticket '$1' has no numeric suffix (expected e.g. CW-363)"
  printf '%s' "$n"
}

# Deterministic, never a free-port scan (W-1): two agents starting at the same
# moment compute the same answer for their own ticket and different answers
# from each other. Tickets 200 apart share a port — run those sequentially.
ticket_port() { printf '%s' "$((PORT_BASE + $(ticket_number "$1") % PORT_SPAN))"; }
ticket_redis_db() { printf '%s' "$(($(ticket_number "$1") % (REDIS_DBS - 1) + 1))"; }

database_url() {
  printf 'postgresql://%s:%s@localhost:%s/%s?%s' "$DB_USER" "$DB_PASS" "$DB_PORT" "$1" "$DB_QUERY"
}

# Last line of defence for W-3: nothing in these scripts may CREATE, migrate,
# seed or DROP the main checkout's database or a Postgres system database.
assert_safe_db() {
  local db="$1"
  case "$db" in
    "$DB_MAIN" | postgres | template0 | template1)
      die "refusing to touch database '$db' — that is the main checkout's / a system database. Per-ticket databases are named watts_wt_<ticket>."
      ;;
  esac
  [[ "$db" =~ ^watts_wt_[a-z0-9_]+$ ]] \
    || die "'$db' is not a worktree database name (expected watts_wt_<ticket>)"
}

repo_root() { git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel; }

# The main checkout is always the first entry of `git worktree list`.
main_checkout() { git -C "$(repo_root)" worktree list --porcelain | sed -n '1s/^worktree //p'; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "$1 not found on PATH — $2"; }

require_docker() {
  require_cmd docker "install Docker Desktop, or start it if it is installed"
  docker info >/dev/null 2>&1 || die "docker daemon is not running — start Docker Desktop"
}

port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# Idempotent: start the repo's shared Postgres if it isn't already up.
ensure_db_container() {
  require_docker
  if docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    return 0
  fi
  if docker ps -a --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    info "starting existing container $DB_CONTAINER"
    docker start "$DB_CONTAINER" >/dev/null
  else
    port_in_use "$DB_PORT" \
      && die "port $DB_PORT is busy but container $DB_CONTAINER does not exist — free the port, or point these scripts elsewhere with CW_DB_PORT/CW_DB_CONTAINER"
    local compose
    compose="$(main_checkout)/docker-compose.yml"
    [[ -f "$compose" ]] || die "no docker-compose.yml at $compose — cannot start $DB_CONTAINER"
    info "starting shared Postgres ($DB_CONTAINER) — docker compose up -d postgres"
    docker compose -p coach-wattz -f "$compose" up -d postgres >/dev/null \
      || die "could not start $DB_CONTAINER — run: docker compose -p coach-wattz -f $compose up -d postgres"
  fi
  local _
  for _ in $(seq 1 30); do
    docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" >/dev/null 2>&1 && return 0
    sleep 1
  done
  die "$DB_CONTAINER did not become ready in 30s — check: docker logs $DB_CONTAINER"
}

psql_run() {
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -tAc "$1"
}
db_exists() { [[ "$(psql_run "SELECT 1 FROM pg_database WHERE datname='$1'")" == "1" ]]; }

drop_db() {
  local db="$1"
  assert_safe_db "$db"
  psql_run "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" >/dev/null
}

create_db() {
  local db="$1" template="${2:-}"
  assert_safe_db "$db"
  if [[ -n "$template" ]]; then
    psql_run "CREATE DATABASE \"$db\" TEMPLATE \"$template\"" >/dev/null
  else
    psql_run "CREATE DATABASE \"$db\"" >/dev/null
  fi
}

# ------------------------------------------------------ migration bookkeeping ---
# The committed migration set is the source of truth (W-7). A database is only
# usable when its _prisma_migrations history is exactly that set — same names,
# nothing missing, nothing extra. "The database exists" says nothing about this:
# a database can carry the *columns* of a migration without its history row
# (that is what `prisma migrate dev --name ...` produces from incidental drift),
# and `prisma migrate deploy` then dies with P3018/42701 on the real migration.

# Migration names committed under <worktree>/prisma/migrations/ (directories only —
# loose .sql files such as catch_up_sync.sql are not migrations).
disk_migrations() {
  local dir="$1/prisma/migrations" d name
  [[ -d "$dir" ]] || return 0
  for d in "$dir"/*/; do
    [[ -d "$d" ]] || continue
    name="${d%/}"
    printf '%s\n' "${name##*/}"
  done | LC_ALL=C sort
}

# Migration names Prisma considers successfully applied in a database.
applied_migrations() {
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$1" -tAc \
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL" \
    2>/dev/null | sed '/^$/d' | LC_ALL=C sort
}

# Compare a database against a checkout's prisma/migrations/.
#   0 = in sync
#   1 = behind — only missing migrations, `prisma migrate deploy` can fix it
#   2 = divergent — history rows that are not in git; cannot be fixed forward
MIG_MISSING=""
MIG_EXTRA=""
check_db_migrations() {
  local checkout="$1" db="$2" disk applied
  disk="$(disk_migrations "$checkout")"
  applied="$(applied_migrations "$db" || true)"
  MIG_MISSING="$(LC_ALL=C comm -23 <(printf '%s\n' "$disk") <(printf '%s\n' "$applied") | sed '/^$/d')"
  MIG_EXTRA="$(LC_ALL=C comm -13 <(printf '%s\n' "$disk") <(printf '%s\n' "$applied") | sed '/^$/d')"
  [[ -n "$MIG_EXTRA" ]] && return 2
  [[ -n "$MIG_MISSING" ]] && return 1
  return 0
}

list_migrations() {
  local label="$1" names="$2"
  [[ -n "$names" ]] || return 0
  warn "  $label"
  # shellcheck disable=SC2086  # intentional word splitting: one line per name
  printf '    %s\n' $names >&2
}

# `prisma migrate deploy` applies exactly what is committed and nothing else.
# `prisma migrate dev [--name]` is never used by these scripts (W-8): it prompts
# (so it hangs in an agent shell) and it *invents* a migration from any schema
# drift it finds.
migrate_deploy() {
  local checkout="$1" db="$2"
  assert_safe_db "$db"
  info "applying migrations to $db (prisma migrate deploy)"
  (
    cd "$checkout" \
      && DATABASE_URL="$(database_url "$db")" pnpm exec prisma migrate deploy
  )
}

# ------------------------------------------------------------------- env file ---
# W-5: .env is generated, never hand-edited.
#
# Three kinds of key:
#   - managed: the database and the ports. Stripped and rewritten on every run.
#   - port-bearing: anything whose value points at the main checkout's dev port
#     (NUXT_AUTH_ORIGIN, NUXT_PUBLIC_SITE_URL, callback URLs, …). These keep the
#     *shape* the main checkout uses — including paths such as /api/auth, which
#     sidebase-auth needs — with only localhost:$MAIN_PORT rewritten. Replacing
#     them wholesale is how you get "Recursion detected at /session".
#   - everything else: carried over untouched from the worktree's existing .env
#     (so keys an agent added survive a refresh), else the main checkout's .env,
#     else .env.example.
ENV_MANAGED_KEYS='^(DATABASE_URL|POSTGRES_HOST|POSTGRES_PORT|POSTGRES_DATABASE|POSTGRES_USER|POSTGRES_PASSWORD|REDIS_URL|PORT|NUXT_PORT|NITRO_PORT)='
ENV_MANAGED_MARKER='^# --- (managed|written) by bin/worktree-up\.sh'

env_value() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  sed -n -E "s/^${key}=[\"']?(.*[^\"'])[\"']?\$/\1/p" "$file" | tail -1
}

generate_env() {
  local dest="$1" ticket="$2" port="$3" db="$4" redis_db="$5"
  local base tmp redis main_env
  main_env="$(main_checkout)/.env"

  if [[ -f "$dest" ]]; then
    base="$dest"
    info "refreshing managed keys in existing .env"
  elif [[ -f "$main_env" ]]; then
    base="$main_env"
    info "seeding .env from the main checkout's .env ($main_env)"
  elif [[ -f "$(main_checkout)/.env.example" ]]; then
    base="$(main_checkout)/.env.example"
    warn "no .env in the main checkout — seeding from .env.example; third-party credentials will be placeholders"
  else
    base=/dev/null
    warn "no .env or .env.example to seed from — writing a minimal .env"
  fi

  # Inherit the Redis URL (host, port and password are the machine's, not ours)
  # and give this ticket its own database index instead of the main checkout's.
  redis="$(env_value "$base" REDIS_URL)"
  [[ -n "$redis" ]] || redis="$REDIS_URL_BASE"
  redis="${redis%/}"
  [[ "$redis" =~ ^(.*)/[0-9]+$ ]] && redis="${BASH_REMATCH[1]}"

  tmp="$(mktemp)"
  grep -vE "$ENV_MANAGED_KEYS" "$base" 2>/dev/null \
    | grep -vE "$ENV_MANAGED_MARKER" \
    | sed -E "s#(localhost|127\.0\.0\.1):$MAIN_PORT#\1:$port#g" >"$tmp" || true
  # Collapse the trailing blank lines the strip leaves behind.
  printf '%s\n' "$(cat "$tmp")" >"$dest"
  rm -f "$tmp"

  cat >>"$dest" <<EOF

# --- managed by bin/worktree-up.sh for $ticket — edits below are overwritten ---
DATABASE_URL="$(database_url "$db")"
POSTGRES_HOST=localhost
POSTGRES_PORT=$DB_PORT
POSTGRES_DATABASE=$db
POSTGRES_USER=$DB_USER
POSTGRES_PASSWORD=$DB_PASS
REDIS_URL="$redis/$redis_db"
PORT=$port
NUXT_PORT=$port
NITRO_PORT=$port
EOF
}

# ----------------------------------------------------------------- warm cache ---
# W-6: APFS clonefile (cp -Rc) is copy-on-write — a 2 GB pnpm node_modules
# clones in seconds and costs no disk until something writes to it.
LOCK_STAMP_REL="node_modules/.cw-worktree-lock"

lock_hash() {
  local checkout="$1"
  [[ -f "$checkout/pnpm-lock.yaml" ]] || return 1
  shasum -a 256 "$checkout/pnpm-lock.yaml" | cut -d' ' -f1
}

clone_dir() {
  local src="$1" dst="$2" name="$3"
  [[ -d "$src" ]] || return 1
  [[ -e "$dst" ]] && {
    info "$name already present, leaving it"
    return 0
  }
  info "cloning $name from the warm cache (APFS clonefile)"
  cp -Rc "$src" "$dst" 2>/dev/null || {
    warn "clonefile unavailable (non-APFS?) — falling back to a real copy"
    cp -R "$src" "$dst"
  }
}
