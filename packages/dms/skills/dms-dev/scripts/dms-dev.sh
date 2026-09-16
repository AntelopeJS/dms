#!/usr/bin/env bash
# dms-dev — start / stop / restart the AntelopeJS DMS dev servers.
# Run from the DMS backend package dir (DMS_BACK_DIR). By default it invokes that project's
# `pnpm dev` / `pnpm frontend:dev` scripts — a convention our playground projects adopt, which
# expand to `ajs project dev …` (the AntelopeJS backend; `ajs project run` is the legacy
# alias) and `ajs-dms dev` (the Inertia frontend loader — it auto-discovers the backend, -b optional).
# Those script names aren't shipped by the DMS, so override the actual commands with
# DMS_BACK_CMD / DMS_FRONT_CMD when a project starts its servers differently.
# Dev watchers cover many edits, but the deterministic recipe when verifying a change is:
# stop both → start backend → wait for "Server started, listening" → start frontend.

set -uo pipefail

DMS_BACK_DIR="${DMS_BACK_DIR:-}"
BACK_CMD="${DMS_BACK_CMD:-pnpm dev}"
FRONT_CMD="${DMS_FRONT_CMD:-pnpm frontend:dev}"
BACK_LOG="${DMS_BACK_LOG:-/tmp/dms-back.log}"
FRONT_LOG="${DMS_FRONT_LOG:-/tmp/dms-front.log}"
BACK_READY_PATTERN='Server started, listening'
FRONT_READY_PATTERN='Local:.*localhost:'
# Patterns that indicate a fatal startup error — detecting any of these aborts
# the wait immediately instead of burning the full timeout.
BACK_ERROR_PATTERN='Failed to load module|Module load failed|Error loading module|UnhandledPromiseRejection|Cannot find module|ENOENT.*package\.json|TypeError:.*at .*ajs|FATAL'
FRONT_ERROR_PATTERN='Cannot find module|Failed to compile|Vite error|ENOENT.*package\.json|EADDRINUSE'
WAIT_TIMEOUT="${DMS_DEV_TIMEOUT:-180}"

PROC_PATTERN='antelope-runner|ajs project (run|dev)|(^|[[:space:]/])ajs-dms dev|dms-frontend/dist/index\.js dev'

log() { printf '[dms-dev] %s\n' "$*"; }

require_dms_back_dir() {
  if [ -z "$DMS_BACK_DIR" ]; then
    log "error: DMS_BACK_DIR is not set. Pass it as an env var, e.g.:"
    log "  DMS_BACK_DIR=/path/to/backend-package $(basename "$0") $1"
    exit 2
  fi
  if [ ! -d "$DMS_BACK_DIR" ]; then
    log "error: DMS_BACK_DIR=$DMS_BACK_DIR does not exist or is not a directory."
    exit 2
  fi
  if [ ! -f "$DMS_BACK_DIR/package.json" ]; then
    log "error: DMS_BACK_DIR=$DMS_BACK_DIR has no package.json — not a DMS backend project."
    exit 2
  fi
}

stop_servers() {
  log "stopping dev servers…"
  pkill -9 -f "antelope-runner" 2>/dev/null || true
  pkill -9 -f "ajs project (run|dev)" 2>/dev/null || true
  pkill -9 -f "(^|[[:space:]/])ajs-dms dev" 2>/dev/null || true
  pkill -9 -f "dms-frontend/dist/index\.js dev" 2>/dev/null || true
  sleep 2
  if pgrep -af "$PROC_PATTERN" >/dev/null 2>&1; then
    log "warning: some processes are still running, killing again:"
    pgrep -af "$PROC_PATTERN" | sed 's/^/  /'
    pgrep -af "$PROC_PATTERN" | awk '{print $1}' | xargs -r kill -9 2>/dev/null || true
    sleep 2
  fi
  if pgrep -af "$PROC_PATTERN" >/dev/null 2>&1; then
    log "error: could not stop all processes:"
    pgrep -af "$PROC_PATTERN" | sed 's/^/  /'
    return 1
  fi
  log "stopped."
}

wait_for() {
  local log_file="$1" pattern="$2" label="$3" error_pattern="$4" proc_pattern="$5" started
  started=$(date +%s)
  # Grace period: pnpm forks/execs into the actual dev process, so pgrep can
  # legitimately return nothing for the first second or two. Don't treat that
  # as a failure.
  local grace_until=$((started + 8))
  while ! grep -qE "$pattern" "$log_file" 2>/dev/null; do
    if grep -qE "$error_pattern" "$log_file" 2>/dev/null; then
      log "FAILED TO START: $label — fatal error detected in $log_file:"
      grep -nE "$error_pattern" "$log_file" | head -5 | sed 's/^/  /'
      log "tail of $log_file:"
      tail -40 "$log_file" | sed 's/^/  /'
      return 1
    fi
    if [ "$(date +%s)" -gt "$grace_until" ] && ! pgrep -f "$proc_pattern" >/dev/null 2>&1; then
      log "FAILED TO START: $label — process exited before becoming ready. Tail of $log_file:"
      tail -40 "$log_file" | sed 's/^/  /'
      return 1
    fi
    if [ $(($(date +%s) - started)) -gt "$WAIT_TIMEOUT" ]; then
      log "FAILED TO START: $label — timed out after ${WAIT_TIMEOUT}s waiting for readiness pattern. Tail of $log_file:"
      tail -40 "$log_file" | sed 's/^/  /'
      return 1
    fi
    sleep 2
  done
  log "$label ready."
}

start_backend() {
  require_dms_back_dir start
  log "starting backend in $DMS_BACK_DIR (logs → $BACK_LOG)…"
  : > "$BACK_LOG"
  # shellcheck disable=SC2086  # word-splitting of the command is intentional
  ( cd "$DMS_BACK_DIR" && setsid nohup $BACK_CMD >> "$BACK_LOG" 2>&1 < /dev/null & )
  wait_for "$BACK_LOG" "$BACK_READY_PATTERN" "backend (http://localhost:5010)" \
    "$BACK_ERROR_PATTERN" 'pnpm.*\bdev\b|antelope-runner|ajs project (run|dev)'
}

start_frontend() {
  require_dms_back_dir start
  log "starting frontend in $DMS_BACK_DIR (logs → $FRONT_LOG)…"
  : > "$FRONT_LOG"
  # shellcheck disable=SC2086  # word-splitting of the command is intentional
  ( cd "$DMS_BACK_DIR" && setsid nohup $FRONT_CMD >> "$FRONT_LOG" 2>&1 < /dev/null & )
  wait_for "$FRONT_LOG" "$FRONT_READY_PATTERN" "frontend (http://localhost:3001)" \
    "$FRONT_ERROR_PATTERN" 'pnpm.*frontend:dev|(^|[[:space:]/])ajs-dms dev|dms-frontend/dist/index\.js dev'
}

status() {
  log "running processes:"
  if ! pgrep -af "$PROC_PATTERN"; then
    echo "  (none)"
  fi
}

usage() {
  cat <<EOF
Usage: $(basename "$0") <command>

Commands:
  restart       Stop both servers, start backend, wait, start frontend, wait.
                Use this after ANY edit to the DMS backend or any DMS module's sources.
  start         Same as restart but does not stop first (errors if already running).
  stop          Kill both servers and any zombie processes.
  status        Show running DMS dev processes.
  back-log [N]  Tail the last N (default 60) lines of the backend log.
  front-log [N] Tail the last N (default 60) lines of the frontend log.

Environment:
  DMS_BACK_DIR    REQUIRED for start/restart. Absolute path to the DMS backend package
                  directory of the AntelopeJS DMS project to run.
  DMS_BACK_CMD    Command to start the backend, run in DMS_BACK_DIR (default: "pnpm dev",
                  the playground convention for "ajs project dev -w" / legacy "run -w").
  DMS_FRONT_CMD   Command to start the frontend, run in DMS_BACK_DIR (default:
                  "pnpm frontend:dev", the playground convention for "ajs-dms dev").
  DMS_BACK_LOG    (default: /tmp/dms-back.log)
  DMS_FRONT_LOG   (default: /tmp/dms-front.log)
  DMS_DEV_TIMEOUT (default: 180 seconds per server)
EOF
}

cmd="${1:-}"
case "$cmd" in
  restart)
    stop_servers || true
    if ! start_backend; then
      log "aborting restart: backend failed to start."
      exit 1
    fi
    if ! start_frontend; then
      log "aborting restart: frontend failed to start."
      exit 1
    fi
    ;;
  start)
    if pgrep -af "$PROC_PATTERN" >/dev/null 2>&1; then
      log "error: servers already running. Use restart, or stop first."
      status
      exit 1
    fi
    if ! start_backend; then
      log "aborting start: backend failed to start."
      exit 1
    fi
    if ! start_frontend; then
      log "aborting start: frontend failed to start."
      exit 1
    fi
    ;;
  stop)
    stop_servers
    ;;
  status)
    status
    ;;
  back-log)
    tail -n "${2:-60}" "$BACK_LOG"
    ;;
  front-log)
    tail -n "${2:-60}" "$FRONT_LOG"
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
