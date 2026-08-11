#!/usr/bin/env bash
# Start this worktree's dev server on this worktree's deterministic port.
#
#   bin/worktree-dev.sh              # nuxt dev on the ticket's port
#   bin/worktree-dev.sh --host       # extra arguments are passed to `nuxt dev`
#
# Why this exists instead of `pnpm dev`: nuxt.config.ts pins
# `devServer.port: 3099`, which is the *main checkout's* port, and Nuxt's CLI
# resolves the listen port from its own arguments and process environment
# before .env is read — so a bare `pnpm dev` inside a worktree ignores the PORT
# the worktree was allocated and lands on top of the main checkout (W-3).
# Exporting NUXT_PORT for the CLI process is what makes the allocated port win.

source "$(dirname "${BASH_SOURCE[0]}")/worktree-common.sh"

CHECKOUT="$(repo_root)"
NAME="$(basename "$CHECKOUT")"

[[ "$CHECKOUT" != "$(main_checkout)" ]] \
  || die "this is the main checkout, which keeps port 3099 — run 'pnpm dev' here, or 'bin/worktree-up.sh <TICKET-ID>' to get a worktree"

[[ "$NAME" =~ ^([A-Z]+-[0-9]+) ]] \
  || die "worktree directory '$NAME' is not named after a ticket — recreate it with: bin/worktree-up.sh <TICKET-ID>"
TICKET="${BASH_REMATCH[1]}"
PORT="$(ticket_port "$TICKET")"

[[ -f "$CHECKOUT/.env" ]] \
  || die "no .env in $CHECKOUT — generate it with: bin/worktree-up.sh $NAME"

if port_in_use "$PORT"; then
  die "port $PORT is already in use — that is $TICKET's dev server, stop it before starting another"
fi

info "starting the dev server for $TICKET on http://localhost:$PORT"
cd "$CHECKOUT" || die "cannot enter $CHECKOUT"
exec env NUXT_PORT="$PORT" NITRO_PORT="$PORT" PORT="$PORT" pnpm dev "$@"
