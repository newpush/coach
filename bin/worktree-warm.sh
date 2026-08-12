#!/usr/bin/env bash
# Build (or refresh) the warm cache that worktree-up.sh draws on:
#   - a migrated + seeded $DB_TEMPLATE database that ticket databases are
#     CREATE DATABASE ... TEMPLATE'd from — a second instead of 227 migrations
#   - a develop-based worktree at $WT_ROOT/.warm with node_modules installed,
#     which worktree-up.sh --clone-node-modules can APFS-clone (measured slower
#     than a warm-store pnpm install on this machine — see worktree-up.sh)
#
#   bin/worktree-warm.sh            # create or refresh
#   bin/worktree-warm.sh --rebuild  # discard the worktree and rebuild from scratch
#
# Run this after a dependency bump or a new migration lands on develop; otherwise
# ticket worktrees inherit a stale cache and pay the cost anyway. A missed
# refresh costs time, not correctness: worktree-up.sh checks the cache's
# pnpm-lock.yaml and the template's migration history before using either.

source "$(dirname "${BASH_SOURCE[0]}")/worktree-common.sh"

REBUILD=0
case "${1:-}" in
  "") ;;
  --rebuild) REBUILD=1 ;;
  *) die "unknown option '$1' — usage: worktree-warm.sh [--rebuild]" ;;
esac

REPO="$(repo_root)"
require_cmd pnpm "install it with: corepack enable && corepack prepare pnpm@11 --activate"

if [[ "$REBUILD" -eq 1 && -d "$WARM_DIR" ]]; then
  info "discarding the existing warm worktree"
  git -C "$REPO" worktree remove "$WARM_DIR" --force \
    || die "could not remove $WARM_DIR — remove it by hand, then re-run"
fi

info "fetching origin/$BASE_BRANCH"
git -C "$REPO" fetch origin "$BASE_BRANCH" --quiet \
  || die "could not fetch origin/$BASE_BRANCH — check network/credentials, then re-run"

if [[ -d "$WARM_DIR" ]]; then
  info "refreshing the warm worktree to origin/$BASE_BRANCH"
  git -C "$WARM_DIR" reset --hard "origin/$BASE_BRANCH" --quiet \
    || die "could not reset $WARM_DIR — rebuild it with: bin/worktree-warm.sh --rebuild"
else
  info "creating the warm worktree at $WARM_DIR"
  git -C "$REPO" worktree add --detach "$WARM_DIR" "origin/$BASE_BRANCH" \
    || die "git worktree add failed — remove a stale entry with: git -C $REPO worktree prune"
fi

# `git reset --hard` leaves untracked files alone, so a migration directory
# invented by an earlier `prisma migrate dev --name` would survive every refresh
# and keep re-poisoning the template (W-8). The committed set is the only
# migration set the template may ever contain.
if [[ -n "$(git -C "$WARM_DIR" status --porcelain -- prisma/migrations)" ]]; then
  warn "removing untracked migrations from the warm worktree:"
  git -C "$WARM_DIR" status --porcelain -- prisma/migrations >&2
  git -C "$WARM_DIR" clean -fdq -- prisma/migrations
fi

# ------------------------------------------------------------- dependencies ---
info "installing dependencies (pnpm install --frozen-lockfile) — the slow part, once"
(cd "$WARM_DIR" && CI=1 pnpm install --frozen-lockfile) \
  || die "pnpm install failed in $WARM_DIR — fix the cause, then re-run bin/worktree-warm.sh"
LOCK="$(lock_hash "$WARM_DIR" || true)"
[[ -n "$LOCK" ]] && printf '%s' "$LOCK" >"$WARM_DIR/$LOCK_STAMP_REL"

# --------------------------------------------------------------- template DB ---
ensure_db_container
assert_safe_db "$DB_TEMPLATE"

# The warm worktree needs a .env for prisma/tsx; port 3199 sits just below the
# ticket band so the warm cache can never answer on a ticket's port.
generate_env "$WARM_DIR/.env" "the warm cache" "$((PORT_BASE - 1))" "$DB_TEMPLATE" "$((REDIS_DBS - 1))"

if db_exists "$DB_TEMPLATE"; then
  info "dropping the stale template $DB_TEMPLATE"
  drop_db "$DB_TEMPLATE"
fi
info "creating template database $DB_TEMPLATE"
create_db "$DB_TEMPLATE"

info "generating Prisma Client (prisma generate)"
(cd "$WARM_DIR" && pnpm exec prisma generate >/dev/null) \
  || die "prisma generate failed in $WARM_DIR"

migrate_deploy "$WARM_DIR" "$DB_TEMPLATE" \
  || die "migrate deploy failed — $DB_TEMPLATE is not usable as a template"

if [[ -f "$WARM_DIR/scripts/seed-dev-user.ts" ]]; then
  info "seeding the dev bypass user into $DB_TEMPLATE"
  # Pin DATABASE_URL as migrate_deploy does — see the same note in
  # worktree-up.sh. Unpinned, an inherited DATABASE_URL would seed *that*
  # database and leave the template without a dev user, silently, so every
  # worktree cloned from it would 401 on the auth bypass.
  (cd "$WARM_DIR" && DATABASE_URL="$(database_url "$DB_TEMPLATE")" pnpm exec tsx scripts/seed-dev-user.ts >/dev/null) \
    || warn "seeding failed — ticket databases cloned from this template will have no dev user"
fi

# The template is only worth keeping if its history is exactly prisma/migrations/
# (W-7). worktree-up.sh re-checks this on every use; failing here means a bad
# template never reaches a ticket worktree in the first place.
MIG_STATUS=0
check_db_migrations "$WARM_DIR" "$DB_TEMPLATE" || MIG_STATUS=$?
if [[ "$MIG_STATUS" -ne 0 ]]; then
  list_migrations "missing from the template:" "$MIG_MISSING"
  list_migrations "applied but not in git:" "$MIG_EXTRA"
  die "$DB_TEMPLATE does not match prisma/migrations/ — refusing to leave a broken template behind. Retry with: bin/worktree-warm.sh --rebuild"
fi

cat <<EOF

$(info "warm cache ready")

  worktree   $WARM_DIR  (detached at origin/$BASE_BRANCH)
  modules    installed; cloned only by worktree-up.sh --clone-node-modules
  template   $DB_TEMPLATE  (container $DB_CONTAINER, host port $DB_PORT)
             $(disk_migrations "$WARM_DIR" | wc -l | tr -d ' ') migrations, verified against prisma/migrations/

  New ticket worktrees now clone both:     bin/worktree-up.sh CW-363
  Refresh after a dep bump or a migration: bin/worktree-warm.sh
EOF
