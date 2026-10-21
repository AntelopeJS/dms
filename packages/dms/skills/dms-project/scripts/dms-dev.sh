#!/usr/bin/env bash
# dms-dev — start / stop / restart the AntelopeJS DMS dev servers of ONE project.
# Run from the DMS backend package dir (DMS_BACK_DIR). By default it invokes that project's
# `pnpm dev` / `pnpm frontend:dev` scripts — a convention our playground projects adopt, which
# expand to `ajs project dev …` (the AntelopeJS backend; `ajs project run` is the legacy
# alias) and `ajs dms dev` (the Inertia frontend loader — it auto-discovers the backend, -b optional).
# Those script names aren't shipped by the DMS, so override the actual commands with
# DMS_BACK_CMD / DMS_FRONT_CMD when a project starts its servers differently.
#
# Scope: the script only signals the processes of DMS_BACK_DIR. The pids it starts are
# recorded in DMS_BACK_DIR/.antelope/dms-dev.pid; without that file it falls back to the dev
# processes whose working directory or command line lies under DMS_BACK_DIR. Other projects'
# dev servers on the same machine are never touched.

set -uo pipefail

DMS_BACK_DIR="${DMS_BACK_DIR:-}"
BACK_CMD="${DMS_BACK_CMD:-pnpm dev}"
FRONT_CMD="${DMS_FRONT_CMD:-pnpm frontend:dev}"
BACK_LOG="${DMS_BACK_LOG:-/tmp/dms-back.log}"
FRONT_LOG="${DMS_FRONT_LOG:-/tmp/dms-front.log}"
BACK_READY_PATTERN='Server started, listening'
FRONT_READY_PATTERN='Server ready on|Local:.*localhost:'
# Patterns that indicate a fatal startup error — detecting any of these aborts
# the wait immediately instead of burning the full timeout.
BACK_ERROR_PATTERN='Failed to load module|Module load failed|Error loading module|UnhandledPromiseRejection|Cannot find module|ENOENT.*package\.json|TypeError:.*at .*ajs|FATAL'
FRONT_ERROR_PATTERN='Cannot find module|Failed to compile|Vite error|ENOENT.*package\.json|EADDRINUSE'
WAIT_TIMEOUT="${DMS_DEV_TIMEOUT:-180}"
STOP_GRACE="${DMS_DEV_STOP_GRACE:-10}"
DEV_JSON_WAIT=5
DEFAULT_BACK_URL='http://localhost:5010'
DEFAULT_FRONT_URL='http://localhost:3001'

# Only picks candidates when no pid file exists, and is always combined with the
# DMS_BACK_DIR scope check: on its own it would match every project on the machine.
PROC_PATTERN='antelope-runner|ajs project (run|dev)|(^|[[:space:]/])(ajs dms|ajs-dms) dev|dms-frontend/dist/index\.js dev|pnpm( run)? (dev|frontend:dev)'

PROJECT_ROOT=""
PID_FILE=""
LAUNCHED_PID=""

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
  PROJECT_ROOT="$(cd "$DMS_BACK_DIR" && pwd -P)"
  PID_FILE="$PROJECT_ROOT/.antelope/dms-dev.pid"
}

is_alive() { [ -n "$1" ] && kill -0 "$1" 2>/dev/null; }

process_cwd() {
  if [ -e "/proc/$1/cwd" ]; then
    readlink "/proc/$1/cwd" 2>/dev/null
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1
  fi
}

process_args() { ps -o args= -p "$1" 2>/dev/null; }

is_in_project() {
  case "$(process_cwd "$1")/" in "$PROJECT_ROOT"/*) return 0 ;; esac
  case "$(process_args "$1") " in *"$PROJECT_ROOT"/* | *"$PROJECT_ROOT "*) return 0 ;; esac
  return 1
}

# The given roots plus every process whose parent chain or process group leads to one.
expand_tree() {
  ps -A -o pid=,ppid=,pgid= | awk -v roots="$*" '
    BEGIN { n = split(roots, r, " "); for (i = 1; i <= n; i++) keep[r[i]] = 1 }
    { parent[$1] = $2; group[$1] = $3 }
    END {
      do {
        grew = 0
        for (p in parent)
          if (!(p in keep) && ((parent[p] in keep) || (group[p] in keep))) { keep[p] = 1; grew = 1 }
      } while (grew)
      for (p in keep) if (p in parent) print p
    }'
}

pid_file_roots() {
  [ -f "$PID_FILE" ] || return 0
  local name pid
  while read -r name pid; do
    [ -n "${pid:-}" ] || continue
    if is_alive "$pid" && is_in_project "$pid"; then
      echo "$pid"
    else
      log "ignoring stale $name pid $pid from $PID_FILE" >&2
    fi
  done < "$PID_FILE"
}

scanned_roots() {
  local listing pid
  # Captured first so the grep below never sees its own command line.
  listing="$(ps -A -o pid=,args=)"
  printf '%s\n' "$listing" | grep -E "$PROC_PATTERN" | awk '{print $1}' | while read -r pid; do
    is_in_project "$pid" && echo "$pid"
  done
}

project_pids() {
  local roots
  roots="$(pid_file_roots)"
  [ -n "$roots" ] || roots="$(scanned_roots)"
  [ -n "$roots" ] || return 0
  # shellcheck disable=SC2086  # one pid per word
  expand_tree $roots | grep -vx "$$"
}

self_ancestors() {
  local pid="$$"
  while [ -n "$pid" ] && [ "$pid" -gt 1 ]; do
    echo "$pid"
    pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
  done
}

# An agent spawned by the backend (e.g. the dms-ai sidecar) would take its own host down.
refuse_if_hosting_self() {
  local hosting
  hosting="$(printf '%s\n' "$@" | grep -Fx -f <(self_ancestors) | head -1)"
  [ -z "$hosting" ] && return 0
  log "error: this shell runs inside the dev servers it was asked to stop (pid $hosting)."
  log "  An agent running inside the DMS must not stop or restart them: rely on hot reload."
  return 1
}

alive_among() {
  local pid
  for pid in "$@"; do is_alive "$pid" && echo "$pid"; done
}

signal_and_wait() {
  local deadline survivors
  kill -TERM "$@" 2>/dev/null
  deadline=$(($(date +%s) + STOP_GRACE))
  survivors="$(alive_among "$@")"
  while [ -n "$survivors" ] && [ "$(date +%s)" -lt "$deadline" ]; do
    sleep 1
    survivors="$(alive_among "$@")"
  done
  [ -n "$survivors" ] || return 0
  log "still running after ${STOP_GRACE}s, sending SIGKILL to: $(echo "$survivors" | tr '\n' ' ')"
  # shellcheck disable=SC2086  # one pid per word
  kill -KILL $survivors 2>/dev/null
  sleep 1
  # shellcheck disable=SC2086
  survivors="$(alive_among $survivors)"
  [ -z "$survivors" ] && return 0
  log "error: could not stop: $(echo "$survivors" | tr '\n' ' ')"
  return 1
}

stop_servers() {
  require_dms_back_dir stop
  log "stopping dev servers of $PROJECT_ROOT…"
  local targets
  targets="$(project_pids)"
  if [ -z "$targets" ]; then
    rm -f "$PID_FILE"
    log "nothing running."
    return 0
  fi
  # shellcheck disable=SC2086  # one pid per word
  refuse_if_hosting_self $targets || exit 3
  # shellcheck disable=SC2086
  signal_and_wait $targets || return 1
  rm -f "$PID_FILE"
  log "stopped."
}

# Detaches the command into its own session so it survives this shell, and records its
# pid. `exec` keeps that pid stable through setsid/nohup down to the command itself.
launch_detached() {
  local name="$1" cmd="$2" log_file="$3"
  if command -v setsid >/dev/null 2>&1; then
    # shellcheck disable=SC2086  # word-splitting of the command is intentional
    (cd "$PROJECT_ROOT" && exec setsid nohup $cmd >> "$log_file" 2>&1 < /dev/null) &
  elif command -v perl >/dev/null 2>&1; then
    # macOS ships no setsid(1); perl's POSIX::setsid does the same before exec.
    # shellcheck disable=SC2086
    (cd "$PROJECT_ROOT" && exec perl -MPOSIX -e 'POSIX::setsid(); exec { $ARGV[0] } @ARGV or die "exec $ARGV[0]: $!\n"' \
      nohup $cmd >> "$log_file" 2>&1 < /dev/null) &
  else
    # shellcheck disable=SC2086
    (cd "$PROJECT_ROOT" && exec nohup $cmd >> "$log_file" 2>&1 < /dev/null) &
  fi
  LAUNCHED_PID=$!
  mkdir -p "$(dirname "$PID_FILE")"
  echo "$name $LAUNCHED_PID" >> "$PID_FILE"
}

fail_start() {
  local label="$1" log_file="$2" reason="$3"
  log "FAILED TO START: $label — $reason. Tail of $log_file:"
  tail -40 "$log_file" | sed 's/^/  /'
}

wait_for() {
  local log_file="$1" pattern="$2" label="$3" error_pattern="$4" pid="$5" started
  started=$(date +%s)
  while ! grep -qE "$pattern" "$log_file" 2>/dev/null; do
    if grep -qE "$error_pattern" "$log_file" 2>/dev/null; then
      log "fatal error detected in $log_file:"
      grep -nE "$error_pattern" "$log_file" | head -5 | sed 's/^/  /'
      fail_start "$label" "$log_file" "fatal error"
      return 1
    fi
    if ! is_alive "$pid"; then
      fail_start "$label" "$log_file" "process $pid exited before becoming ready"
      return 1
    fi
    if [ $(($(date +%s) - started)) -gt "$WAIT_TIMEOUT" ]; then
      fail_start "$label" "$log_file" "timed out after ${WAIT_TIMEOUT}s waiting for readiness pattern"
      return 1
    fi
    sleep 1
  done
}

# Prints "<pid> <url>" for the api endpoint a dev.json records.
read_dev_json() {
  command -v node >/dev/null 2>&1 || return 0
  # shellcheck disable=SC2016  # a JavaScript template literal, not a shell expansion
  node -e '
    const dev = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const servers = dev.servers ?? {};
    const endpoint = (servers.api ?? Object.values(servers)[0])?.endpoints?.[0];
    if (!endpoint) process.exit(0);
    const wildcard = ["0.0.0.0", "::", ""].includes(endpoint.host ?? "");
    const host = wildcard ? "localhost" : endpoint.host;
    console.log(`${dev.pid} ${endpoint.protocol ?? "http"}://${host}:${endpoint.port}`);
  ' "$1" 2>/dev/null
}

# The project may live in DMS_BACK_DIR or one level below (`ajs project dev -p playground`).
# A dev.json outlives its backend, so only one whose writer is alive and ours is trusted.
dev_json_url() {
  local file pid url
  for file in "$PROJECT_ROOT/.antelope/dev.json" "$PROJECT_ROOT"/*/.antelope/dev.json; do
    [ -f "$file" ] || continue
    read -r pid url <<< "$(read_dev_json "$file")"
    if [ -n "${url:-}" ] && is_alive "$pid" && is_in_project "$pid"; then
      echo "$url"
      return
    fi
  done
}

backend_url() {
  local url deadline
  deadline=$(($(date +%s) + DEV_JSON_WAIT))
  url="$(dev_json_url)"
  while [ -z "$url" ] && [ "$(date +%s)" -lt "$deadline" ]; do
    sleep 1
    url="$(dev_json_url)"
  done
  [ -n "$url" ] || url="$(grep -oE "$BACK_READY_PATTERN on https?://[^ /]+" "$BACK_LOG" | tail -1 | awk '{print $NF}')"
  echo "${url:-$DEFAULT_BACK_URL (assumed: no .antelope/dev.json found)}"
}

frontend_url() {
  local url
  url="$(grep -oE '(Server ready on|Local:)[[:space:]]+https?://[^ /]+' "$FRONT_LOG" | tail -1 | awk '{print $NF}')"
  echo "${url:-$DEFAULT_FRONT_URL (assumed: no ready line with a URL)}"
}

start_backend() {
  log "starting backend in $PROJECT_ROOT (logs → $BACK_LOG)…"
  : > "$BACK_LOG"
  launch_detached backend "$BACK_CMD" "$BACK_LOG"
  wait_for "$BACK_LOG" "$BACK_READY_PATTERN" "backend" "$BACK_ERROR_PATTERN" "$LAUNCHED_PID" || return 1
  log "backend ready on $(backend_url)."
}

start_frontend() {
  log "starting frontend in $PROJECT_ROOT (logs → $FRONT_LOG)…"
  : > "$FRONT_LOG"
  launch_detached frontend "$FRONT_CMD" "$FRONT_LOG"
  wait_for "$FRONT_LOG" "$FRONT_READY_PATTERN" "frontend" "$FRONT_ERROR_PATTERN" "$LAUNCHED_PID" || return 1
  log "frontend ready on $(frontend_url)."
}

start_servers() {
  local verb="$1"
  rm -f "$PID_FILE"
  if ! start_backend; then
    log "aborting $verb: backend failed to start."
    exit 1
  fi
  if ! start_frontend; then
    log "aborting $verb: frontend failed to start."
    exit 1
  fi
}

status() {
  require_dms_back_dir status
  log "dev processes of $PROJECT_ROOT:"
  local targets
  targets="$(project_pids)"
  if [ -z "$targets" ]; then
    echo "  (none)"
    return
  fi
  # shellcheck disable=SC2086  # one pid per word
  ps -o pid=,args= -p "$(echo $targets | tr ' ' ',')" | sed 's/^/  /'
}

usage() {
  cat <<EOF
Usage: $(basename "$0") <command>

Commands:
  restart       Stop this project's servers, start backend, wait, start frontend, wait.
                Only when hot reload cannot apply a change, and never from an agent
                running inside the DMS: it would stop its own host.
  start         Same as restart but does not stop first (errors if already running).
  stop          Stop this project's servers: SIGTERM, then SIGKILL after the grace period.
  status        Show this project's dev processes.
  back-log [N]  Tail the last N (default 60) lines of the backend log.
  front-log [N] Tail the last N (default 60) lines of the frontend log.

Environment:
  DMS_BACK_DIR       REQUIRED for start/restart/stop/status. Absolute path to the DMS backend
                     package directory of the AntelopeJS DMS project to run.
  DMS_BACK_CMD       Command to start the backend, run in DMS_BACK_DIR (default: "pnpm dev",
                     the playground convention for "ajs project dev -w" / legacy "run -w").
  DMS_FRONT_CMD      Command to start the frontend, run in DMS_BACK_DIR (default:
                     "pnpm frontend:dev", the playground convention for "ajs dms dev").
  DMS_BACK_LOG       (default: /tmp/dms-back.log)
  DMS_FRONT_LOG      (default: /tmp/dms-front.log)
  DMS_DEV_TIMEOUT    (default: 180 seconds per server)
  DMS_DEV_STOP_GRACE (default: 10 seconds between SIGTERM and SIGKILL)
EOF
}

cmd="${1:-}"
case "$cmd" in
  restart)
    stop_servers || true
    start_servers restart
    ;;
  start)
    require_dms_back_dir start
    if [ -n "$(project_pids)" ]; then
      log "error: servers already running. Use restart, or stop first."
      status
      exit 1
    fi
    start_servers start
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
  ""|-h|--help|help)
    usage
    ;;
  front-log)
    tail -n "${2:-60}" "$FRONT_LOG"
    ;;
  *)
    usage
    exit 2
    ;;
esac
