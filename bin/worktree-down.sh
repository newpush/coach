#!/usr/bin/env bash
# Tear down a ticket worktree: drop its database, flush its Redis index, remove
# the worktree, and optionally delete the branch.
#
#   bin/worktree-down.sh CW-363
#   bin/worktree-down.sh CW-363 --force           # discard uncommitted/unpushed work
#   bin/worktree-down.sh CW-363 --delete-branch
#
# W-9: refuses by default if the worktree has uncommitted changes or commits
# that are not on any remote. Teardown runs unattended after merges, so it must
# not be able to destroy unpushed work.

source "$(dirname "${BASH_SOURCE[0]}")/worktree-common.sh"

TICKET="${1:-}"
FORCE=0
DELETE_BRANCH=0
shift || true
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --delete-branch) DELETE_BRANCH=1 ;;
    *) die "unknown option '$arg' — usage: worktree-down.sh <TICKET-ID> [--force] [--delete-branch]" ;;
  esac
done

[[ -n "$TICKET" ]] || die "usage: worktree-down.sh <TICKET-ID> [--force] [--delete-branch]"
[[ "$TICKET" =~ ^[A-Z]+-[0-9]+(-[A-Za-z0-9][A-Za-z0-9-]*)?$ ]] \
  || die "ticket must look like CW-363 or CW-363-scratch (got '$TICKET')"

REPO="$(repo_root)"
WT="$WT_ROOT/$TICKET"
DB="$(ticket_db "$TICKET")"
REDIS_DB="$(ticket_redis_db "$TICKET")"

# W-3: never let a mistyped ticket turn into a DROP of the main database.
assert_safe_db "$DB"

if [[ -d "$WT" ]]; then
  BRANCH="$(git -C "$WT" rev-parse --abbrev-ref HEAD)"

  if [[ "$FORCE" -eq 0 ]]; then
    if [[ -n "$(git -C "$WT" status --porcelain)" ]]; then
      git -C "$WT" status --short >&2
      die "$TICKET has uncommitted changes — commit them, or re-run with --force"
    fi
    # HEAD only — '--branches' would scan every branch in the shared repo and
    # refuse because some *other* worktree has unpushed commits.
    unpushed="$(git -C "$WT" log --oneline HEAD --not --remotes 2>/dev/null | head -5)"
    if [[ -n "$unpushed" ]]; then
      printf '%s\n' "$unpushed" >&2
      die "$TICKET has commits not on any remote — push them (git -C $WT push), or re-run with --force"
    fi
  fi

  info "removing worktree $WT"
  REMOVE_ARGS=()
  if [[ "$FORCE" -eq 1 ]]; then REMOVE_ARGS=(--force); fi
  git -C "$REPO" worktree remove ${REMOVE_ARGS[@]+"${REMOVE_ARGS[@]}"} "$WT" \
    || die "could not remove $WT — close anything running in it, then re-run"

  if [[ "$DELETE_BRANCH" -eq 1 ]]; then
    info "deleting branch $BRANCH"
    git -C "$REPO" branch -d "$BRANCH" 2>/dev/null \
      || warn "branch $BRANCH is not fully merged; delete it manually with: git -C $REPO branch -D $BRANCH"
  fi
else
  info "no worktree at $WT (already removed?)"
  git -C "$REPO" worktree prune
fi

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$DB_CONTAINER" && db_exists "$DB"; then
  info "dropping database $DB"
  drop_db "$DB"
fi

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$REDIS_CONTAINER"; then
  if docker exec -i "$REDIS_CONTAINER" redis-cli -a dragonfly --no-auth-warning -n "$REDIS_DB" FLUSHDB >/dev/null 2>&1; then
    info "flushed Redis database $REDIS_DB (index 0 — the main checkout's — is never touched)"
  else
    warn "could not flush Redis database $REDIS_DB in $REDIS_CONTAINER — flush it by hand if stale jobs matter"
  fi
fi

info "done — $TICKET cleaned up"
