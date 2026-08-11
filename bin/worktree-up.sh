#!/usr/bin/env bash
# Create (or refresh) a ready-to-work worktree for one Linear ticket: branch off
# origin/develop, install dependencies, own database (cloned from the warm
# template), own port, own generated .env — so `bin/worktree-dev.sh` and
# `pnpm typecheck` are meaningful immediately.
#
#   bin/worktree-up.sh CW-363                     # feat/CW-363
#   bin/worktree-up.sh CW-363 fix modal-zindex    # fix/CW-363-modal-zindex
#   bin/worktree-up.sh CW-363 --no-prepare        # skip `nuxt prepare`
#   bin/worktree-up.sh CW-363 --clone-node-modules  # APFS-clone node_modules from the
#                                                   # warm cache instead of installing
#                                                   # (only faster on a cold pnpm store)
#   bin/worktree-up.sh CW-363 --no-install        # skip dependency + prisma work
#   bin/worktree-up.sh CW-363 --no-migrate        # create the database, don't migrate it
#
# Idempotent (W-4): re-running against an existing worktree refreshes the
# managed .env keys, reinstalls only if pnpm-lock.yaml changed, and applies
# migrations that landed since — without touching your uncommitted work.

source "$(dirname "${BASH_SOURCE[0]}")/worktree-common.sh"

# ---------------------------------------------------------------- arguments ---
TICKET=""
TYPE="feat"
SLUG=""
INSTALL=1
PREPARE=1
MIGRATE=1
CLONE_MODULES=0
POS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-install) INSTALL=0 ;;
    --clone-node-modules) CLONE_MODULES=1 ;;
    --no-prepare) PREPARE=0 ;;
    --no-migrate) MIGRATE=0 ;;
    -h | --help)
      sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) die "unknown option '$1' (see: bin/worktree-up.sh --help)" ;;
    *)
      POS=$((POS + 1))
      case "$POS" in
        1) TICKET="$1" ;;
        2) TYPE="$1" ;;
        3) SLUG="$1" ;;
        *) die "too many arguments (got '$1') — usage: worktree-up.sh <TICKET-ID> [type] [slug]" ;;
      esac
      ;;
  esac
  shift
done

[[ -n "$TICKET" ]] || die "usage: worktree-up.sh <TICKET-ID> [type] [slug] [--clone-node-modules] [--no-install] [--no-prepare] [--no-migrate]"

# A plain ticket (CW-363), optionally with a scratch suffix (CW-363-verify) for
# throwaway worktrees that test the tooling itself.
if [[ "$TICKET" =~ ^([A-Z]+-[0-9]+)(-[A-Za-z0-9][A-Za-z0-9-]*)?$ ]]; then
  TICKET_BASE="${BASH_REMATCH[1]}"
else
  die "ticket must look like CW-363 or CW-363-scratch (got '$TICKET')"
fi

REPO="$(repo_root)"
WT="$WT_ROOT/$TICKET"
BRANCH="$TYPE/$TICKET${SLUG:+-$SLUG}"
DB="$(ticket_db "$TICKET")"
# Port derives from the base ticket number: a scratch worktree deliberately
# shares it, so don't run two dev servers off the same ticket at once.
PORT="$(ticket_port "$TICKET_BASE")"
REDIS_DB="$(ticket_redis_db "$TICKET_BASE")"

assert_safe_db "$DB"

[[ "$TICKET" == "$TICKET_BASE" ]] \
  || warn "$TICKET is a scratch worktree — it shares $TICKET_BASE's port ($PORT)"

# ---------------------------------------------------------------- worktree ---
if [[ -d "$WT" ]]; then
  info "worktree already exists: $WT"
  CURRENT_BRANCH="$(git -C "$WT" rev-parse --abbrev-ref HEAD)"
  if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
    warn "$WT is on '$CURRENT_BRANCH', not '$BRANCH' — leaving it alone (W-4: a refresh never moves your branch)"
    BRANCH="$CURRENT_BRANCH"
  fi
else
  info "fetching origin/$BASE_BRANCH"
  git -C "$REPO" fetch origin "$BASE_BRANCH" --quiet \
    || die "could not fetch origin/$BASE_BRANCH — check network/credentials, then re-run"
  info "creating worktree $WT on $BRANCH"
  if git -C "$REPO" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    info "branch $BRANCH already exists — checking it out instead of recreating it"
    git -C "$REPO" worktree add "$WT" "$BRANCH" \
      || die "git worktree add failed — is $BRANCH checked out in another worktree? (git worktree list)"
  else
    git -C "$REPO" worktree add "$WT" -b "$BRANCH" "origin/$BASE_BRANCH" \
      || die "git worktree add failed — remove a stale entry with: git worktree prune"
  fi
fi

# ------------------------------------------------------------ dependencies ---
# W-6, measured rather than assumed (CW-363, this machine, 2 GB / ~2238 packages):
#
#   pnpm install --frozen-lockfile, warm pnpm store   17.2s  (incl. prisma generate)
#   cp -Rc node_modules from the warm worktree        31-37s
#
# pnpm's content-addressed store already hardlinks every package, so an install
# is doing roughly the same per-file work the clone is — and it parallelises it
# better. The APFS clone therefore stays OFF by default (--clone-node-modules
# turns it on: it is store-independent, so it still wins on a cold store, e.g.
# right after `pnpm store prune` or on a fresh machine).
#
# What the warm cache is actually worth here is the *template database*: a
# ticket database is CREATE DATABASE ... TEMPLATE (about a second) instead of
# 227 migrations.
#
# The stamp file records which pnpm-lock.yaml the current node_modules was
# built from, so a refresh reinstalls only when the lockfile actually moved.
LOCK="$(lock_hash "$WT" || true)"
STAMP="$WT/$LOCK_STAMP_REL"

install_deps() {
  require_cmd pnpm "install it with: corepack enable && corepack prepare pnpm@11 --activate"

  if [[ -d "$WT/node_modules" && -f "$STAMP" && -n "$LOCK" && "$(cat "$STAMP")" == "$LOCK" ]]; then
    info "dependencies already match pnpm-lock.yaml — skipping install"
    return 0
  fi

  if [[ "$CLONE_MODULES" -eq 1 && ! -d "$WT/node_modules" ]]; then
    local warm_lock=""
    [[ -d "$WARM_DIR" ]] && warm_lock="$(lock_hash "$WARM_DIR" || true)"
    if [[ -d "$WARM_DIR/node_modules" && -n "$LOCK" && "$warm_lock" == "$LOCK" ]]; then
      if clone_dir "$WARM_DIR/node_modules" "$WT/node_modules" "node_modules"; then
        printf '%s' "$LOCK" >"$STAMP"
        return 0
      fi
    elif [[ -d "$WARM_DIR/node_modules" ]]; then
      warn "warm cache is at a different pnpm-lock.yaml than $TICKET — refresh it with: bin/worktree-warm.sh"
    else
      warn "no warm cache at $WARM_DIR — build one with: bin/worktree-warm.sh"
    fi
  fi

  info "installing dependencies (pnpm install --frozen-lockfile)"
  (cd "$WT" && CI=1 pnpm install --frozen-lockfile --prefer-offline) \
    || die "pnpm install failed in $WT — fix the cause, then re-run: bin/worktree-up.sh $TICKET"
  printf '%s' "$LOCK" >"$STAMP"
}

# The warm cache carries the Prisma Client generated for the warm commit's
# schema, which predates anything merged since. Regenerating (~4s) means the
# first typecheck reports real errors instead of cache-shaped phantoms.
generate_prisma_client() {
  info "generating Prisma Client (prisma generate)"
  (cd "$WT" && pnpm exec prisma generate >/dev/null) \
    || die "prisma generate failed in $WT — run it manually: cd $WT && pnpm exec prisma generate"
}

if [[ "$INSTALL" -eq 1 ]]; then
  install_deps
else
  warn "skipping dependency install (--no-install)"
fi

# ------------------------------------------------------------------- .env ---
# W-5: generated, never hand-edited.
generate_env "$WT/.env" "$TICKET" "$PORT" "$DB" "$REDIS_DB"

if [[ "$INSTALL" -eq 1 ]]; then
  generate_prisma_client
fi

# ---------------------------------------------------------------- database ---
# W-2/W-3: one database per ticket on the shared watts-postgres container; the
# main checkout's '$DB_MAIN' database is never created, migrated or dropped.
ensure_db_container

TEMPLATE_USABLE=0
if db_exists "$DB_TEMPLATE"; then
  if check_db_migrations "$WT" "$DB_TEMPLATE"; then
    TEMPLATE_USABLE=1
  else
    warn "template $DB_TEMPLATE does not match prisma/migrations/ — refusing to clone it"
    list_migrations "never applied to the template:" "$MIG_MISSING"
    list_migrations "applied but not in git (phantom \`migrate dev --name\` migrations):" "$MIG_EXTRA"
    warn "  refresh it with: bin/worktree-warm.sh --rebuild"
    warn "  continuing from an empty database instead — correct, just slower"
  fi
fi

FRESH_DB=0
if db_exists "$DB"; then
  info "database $DB already exists"
elif [[ "$TEMPLATE_USABLE" -eq 1 ]]; then
  info "creating $DB from template $DB_TEMPLATE (migration history verified)"
  create_db "$DB" "$DB_TEMPLATE"
  FRESH_DB=1
else
  info "creating empty database $DB"
  create_db "$DB"
  FRESH_DB=1
fi

# -------------------------------------------------------------- migrations ---
if [[ "$MIGRATE" -eq 1 ]]; then
  MIG_STATUS=0
  check_db_migrations "$WT" "$DB" || MIG_STATUS=$?

  if [[ "$MIG_STATUS" -eq 2 ]]; then
    warn "database $DB has migration history that is not in prisma/migrations/:"
    list_migrations "unknown to git:" "$MIG_EXTRA"
    list_migrations "still missing:" "$MIG_MISSING"
    die "$DB cannot be migrated forward. Recreate it:
    bin/worktree-down.sh $TICKET --force && bin/worktree-up.sh $TICKET
  If the worktree holds work you need, keep it and reset just the database:
    docker exec -i $DB_CONTAINER psql -U $DB_USER -d postgres -c 'DROP DATABASE \"$DB\" WITH (FORCE)'
    bin/worktree-up.sh $TICKET"
  fi

  if [[ "$MIG_STATUS" -eq 1 ]]; then
    migrate_deploy "$WT" "$DB" \
      || die "prisma migrate deploy failed against $DB — recreate it with: bin/worktree-down.sh $TICKET --force && bin/worktree-up.sh $TICKET"
    MIG_STATUS=0
    check_db_migrations "$WT" "$DB" || MIG_STATUS=$?
    if [[ "$MIG_STATUS" -ne 0 ]]; then
      list_migrations "still missing:" "$MIG_MISSING"
      list_migrations "unknown to git:" "$MIG_EXTRA"
      die "'prisma migrate deploy' did not bring $DB in sync with prisma/migrations/"
    fi
  fi

  info "database $DB in sync with prisma/migrations/ ($(disk_migrations "$WT" | wc -l | tr -d ' ') migrations)"

  # A brand-new database has no user to log in as. The dev auth bypass
  # (server/plugins/auth-bypass.ts) needs AUTH_BYPASS_USER to exist as a row.
  if [[ "$FRESH_DB" -eq 1 && "$INSTALL" -eq 1 && -f "$WT/scripts/seed-dev-user.ts" ]]; then
    info "seeding the dev bypass user (scripts/seed-dev-user.ts)"
    (cd "$WT" && pnpm exec tsx scripts/seed-dev-user.ts >/dev/null) \
      || warn "seeding the dev user failed — log-in via the auth bypass will 401 until you run: cd $WT && pnpm exec tsx scripts/seed-dev-user.ts"
  fi
else
  warn "skipping migrations (--no-migrate) — $DB may not match prisma/migrations/"
fi

# ----------------------------------------------------------- generated types ---
# `pnpm lint` and `pnpm typecheck` need .nuxt/ types. It is deliberately NOT
# warm-cloned: .nuxt/tsconfig*.json contains absolute paths, so a cloned one
# would point typecheck at the warm worktree's files.
if [[ "$PREPARE" -eq 1 && "$INSTALL" -eq 1 ]]; then
  info "generating Nuxt types (nuxt prepare)"
  (cd "$WT" && pnpm exec nuxt prepare >/dev/null 2>&1) \
    || warn "'nuxt prepare' failed — run it manually before typecheck: cd $WT && pnpm exec nuxt prepare"
else
  warn "skipping 'nuxt prepare' — run it before typecheck: cd $WT && pnpm exec nuxt prepare"
fi

# ------------------------------------------------------------------ report ---
cat <<EOF

$(info "ready")

  worktree   $WT
  branch     $BRANCH
  database   $DB  (container $DB_CONTAINER, host port $DB_PORT)
  redis db   $REDIS_DB  (container $REDIS_CONTAINER, shared, index 0 is the main checkout's)
  dev server http://localhost:$PORT

  cd $WT
  bin/worktree-dev.sh           # dev server on $PORT — NOT bare 'pnpm dev', which
                                # ignores .env's PORT and binds 3099, the main checkout's

  apply migrations that landed on $BASE_BRANCH:
    pnpm exec prisma migrate deploy
  new migration (never 'prisma migrate dev --name' in automation — it prompts and invents migrations):
    pnpm exec prisma migrate dev --name my_change     # interactive shells only

  verify:  cd $WT && pnpm lint && pnpm typecheck && pnpm test:unit
  cleanup: bin/worktree-down.sh $TICKET
EOF
