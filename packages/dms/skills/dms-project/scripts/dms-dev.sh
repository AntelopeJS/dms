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
#
# Windows (Git Bash, MSYS2, Cygwin): their ps lists only their own processes and takes no -o,
# while the dev servers run as native node.exe processes. There the script reads the Windows
# process table (PowerShell's Get-CimInstance Win32_Process), works in Windows pids, and stops
# a server's whole tree with taskkill /T /F.

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
# The same, split per server, for the commands that restart only one of them.
BACK_PROC_PATTERN='antelope-runner|ajs project (run|dev)|pnpm( run)? dev'
FRONT_PROC_PATTERN='(^|[[:space:]/])(ajs dms|ajs-dms) dev|dms-frontend/dist/index\.js dev|pnpm( run)? frontend:dev'

case "$(uname -s 2>/dev/null)" in
  MINGW* | MSYS* | CYGWIN*) IS_WINDOWS=1 ;;
  *) IS_WINDOWS="" ;;
esac

# One line per process: "pid<TAB>ppid<TAB>created<TAB>command line". The creation time, a
# fixed-width UTC timestamp, tells a child from an older process holding a dead parent's pid.
# shellcheck disable=SC2016  # PowerShell code, not shell expansions
WIN_PROCESS_QUERY='[Console]::OutputEncoding = [Text.Encoding]::UTF8
$tab = [char]9
Get-CimInstance Win32_Process | ForEach-Object {
  $created = "00000000000000000000"
  if ($_.CreationDate) { $created = $_.CreationDate.ToUniversalTime().ToString("yyyyMMddHHmmssffffff") }
  [string]$_.ProcessId + $tab + $_.ParentProcessId + $tab + $created + $tab + ($_.CommandLine -replace "\s+", " ")
}'

PROJECT_ROOT=""
PID_FILE=""
LAUNCHED_PID=""
# Windows only: the process table (see refresh_process_table) and the project root as a
# lowercase Windows path with forward slashes, the form command lines are compared in.
WIN_TABLE=""
WIN_ROOT=""

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
  [ -z "$IS_WINDOWS" ] || WIN_ROOT="$(cygpath -m "$PROJECT_ROOT" | tr '[:upper:]' '[:lower:]')"
}

is_alive() { [ -n "$1" ] && kill -0 "$1" 2>/dev/null; }

# Reads the Windows process table once for the lookups that follow; nothing elsewhere.
# Call it in the shell that runs them: a command substitution's copy is lost with it.
refresh_process_table() {
  [ -n "$IS_WINDOWS" ] || return 0
  WIN_TABLE="$(powershell.exe -NoProfile -NonInteractive -EncodedCommand \
    "$(printf '%s' "$WIN_PROCESS_QUERY" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n')" \
    2>/dev/null | tr -d '\r')"
}

# The Windows pid behind a Git Bash / MSYS2 / Cygwin pid.
win_pid() { cat "/proc/$1/winpid" 2>/dev/null; }

win_alive() {
  [ -n "$1" ] && printf '%s\n' "$WIN_TABLE" | awk -F'\t' -v pid="$1" '$1 == pid { found = 1 } END { exit !found }'
}

win_args() { printf '%s\n' "$WIN_TABLE" | awk -F'\t' -v pid="$1" '$1 == pid { print $4; exit }'; }

# A native process exposes no working directory: only its command line can name the project.
win_in_project() {
  local args
  # shellcheck disable=SC1003  # tr's escaped backslash, not a quote
  args="$(win_args "$1" | tr '\\' '/' | tr '[:upper:]' '[:lower:]')"
  case "$args " in *"$WIN_ROOT"/* | *"$WIN_ROOT "* | *"$WIN_ROOT\""*) return 0 ;; esac
  return 1
}

# The given Windows pids plus every process whose parent chain leads to one (Windows has no
# process groups), each child created after its parent.
win_expand_tree() {
  printf '%s\n' "$WIN_TABLE" | awk -F'\t' -v roots="$*" '
    BEGIN { n = split(roots, r, " "); for (i = 1; i <= n; i++) keep[r[i]] = 1 }
    { parent[$1] = $2; created[$1] = $3 "" }
    END {
      do {
        grew = 0
        for (p in parent)
          if (!(p in keep) && (parent[p] in keep) && created[p] >= created[parent[p]]) { keep[p] = 1; grew = 1 }
      } while (grew)
      for (p in keep) if (p in parent) print p
    }'
}

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
  if [ -n "$IS_WINDOWS" ]; then
    win_in_project "$(win_pid "$1")"
    return
  fi
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

# The live pids the pid file records, of every server or only of the one named; on Windows,
# as Windows pids.
pid_file_roots() {
  [ -f "$PID_FILE" ] || return 0
  local only="${1:-}" name pid
  while read -r name pid; do
    [ -n "${pid:-}" ] || continue
    [ -z "$only" ] || [ "$name" = "$only" ] || continue
    if is_alive "$pid" && is_in_project "$pid"; then
      if [ -n "$IS_WINDOWS" ]; then win_pid "$pid"; else echo "$pid"; fi
    else
      log "ignoring stale $name pid $pid from $PID_FILE" >&2
    fi
  done < "$PID_FILE"
}

scanned_roots() {
  local pattern="${1:-$PROC_PATTERN}" listing pid
  if [ -n "$IS_WINDOWS" ]; then
    # Matched with forward slashes, the way the patterns spell paths.
    # shellcheck disable=SC1003  # tr's escaped backslash, not a quote
    printf '%s\n' "$WIN_TABLE" | cut -f1,4 | tr '\\' '/' | grep -E "$pattern" | cut -f1 | while read -r pid; do
      win_in_project "$pid" && echo "$pid"
    done
    return
  fi
  # Captured first so the grep below never sees its own command line.
  listing="$(ps -A -o pid=,args=)"
  printf '%s\n' "$listing" | grep -E "$pattern" | awk '{print $1}' | while read -r pid; do
    is_in_project "$pid" && echo "$pid"
  done
}

# The process pattern of the server named, or of both.
server_pattern() {
  case "${1:-}" in
    backend) echo "$BACK_PROC_PATTERN" ;;
    frontend) echo "$FRONT_PROC_PATTERN" ;;
    *) echo "$PROC_PATTERN" ;;
  esac
}

# Every process of this project's servers, or of the one named (backend or frontend). On
# Windows they are Windows pids, read from the table refresh_process_table last read.
project_pids() {
  local name="${1:-}" roots
  roots="$(pid_file_roots "$name")"
  [ -n "$roots" ] || roots="$(scanned_roots "$(server_pattern "$name")")"
  [ -n "$roots" ] || return 0
  if [ -n "$IS_WINDOWS" ]; then
    # shellcheck disable=SC2086  # one pid per word
    win_expand_tree $roots | grep -vx "$(win_pid $$)"
    return
  fi
  # shellcheck disable=SC2086  # one pid per word
  expand_tree $roots | grep -vx "$$"
}

self_ancestors() {
  if [ -n "$IS_WINDOWS" ]; then
    printf '%s\n' "$WIN_TABLE" | awk -F'\t' -v pid="$(win_pid $$)" '
      { parent[$1] = $2; created[$1] = $3 "" }
      END {
        for (depth = 0; pid != "" && pid != "0" && depth < 256; depth++) {
          print pid
          if (!(pid in parent) || !(parent[pid] in parent) || created[parent[pid]] > created[pid]) break
          pid = parent[pid]
        }
      }'
    return
  fi
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

# Windows has no SIGTERM a console node process would handle: each tree is ended at once.
win_kill_and_wait() {
  local pid survivors
  for pid in "$@"; do taskkill //T //F //PID "$pid" >/dev/null 2>&1; done
  sleep 1
  refresh_process_table
  survivors="$(for pid in "$@"; do win_alive "$pid" && echo "$pid"; done)"
  [ -z "$survivors" ] && return 0
  log "error: could not stop: $(echo "$survivors" | tr '\n' ' ')"
  return 1
}

# Drops the pid the pid file records for the server named, or the whole file.
forget_pids() {
  if [ -z "${1:-}" ]; then
    rm -f "$PID_FILE"
    return
  fi
  [ -f "$PID_FILE" ] || return 0
  local kept
  kept="$(grep -v "^$1 " "$PID_FILE")"
  if [ -n "$kept" ]; then printf '%s\n' "$kept" > "$PID_FILE"; else rm -f "$PID_FILE"; fi
}

# Stops this project's servers, or only the one named (backend or frontend).
stop_servers() {
  local name="${1:-}"
  require_dms_back_dir "${cmd:-stop}"
  log "stopping ${name:-dev servers} of $PROJECT_ROOT…"
  local targets
  refresh_process_table
  targets="$(project_pids "$name")"
  if [ -z "$targets" ]; then
    forget_pids "$name"
    log "nothing running."
    return 0
  fi
  # shellcheck disable=SC2086  # one pid per word
  refuse_if_hosting_self $targets || exit 3
  if [ -n "$IS_WINDOWS" ]; then
    # shellcheck disable=SC2086
    win_kill_and_wait $targets || return 1
  else
    # shellcheck disable=SC2086
    signal_and_wait $targets || return 1
  fi
  forget_pids "$name"
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
    if [ -n "${url:-}" ] && is_project_process "$pid"; then
      echo "$url"
      return
    fi
  done
}

# Whether a pid a server wrote down itself (node's own, a Windows pid on Windows) is alive
# and one of this project's.
is_project_process() {
  if [ -z "$IS_WINDOWS" ]; then
    is_alive "$1" && is_in_project "$1"
    return
  fi
  [ -n "$1" ] || return 1
  refresh_process_table
  project_pids backend | grep -qx "$1"
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

# Stops the server named (backend or frontend) if it runs, and starts it again: the other
# one keeps running.
restart_server() {
  local name="$1"
  stop_servers "$name" || true
  if ! "start_$name"; then
    log "aborting $cmd: $name failed to start."
    exit 1
  fi
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
  refresh_process_table
  targets="$(project_pids)"
  if [ -z "$targets" ]; then
    echo "  (none)"
    return
  fi
  if [ -n "$IS_WINDOWS" ]; then
    printf '%s\n' "$WIN_TABLE" | awk -F'\t' -v pids="$targets" '
      BEGIN { n = split(pids, p, "[[:space:]]+"); for (i = 1; i <= n; i++) wanted[p[i]] = 1 }
      $1 in wanted { printf "  %s %s\n", $1, $4 }'
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
  restart-back  Stop this project's backend if it runs, start it again, wait: the frontend
                keeps running. Same rules as restart.
  restart-front The same for the frontend alone, e.g. once it crashed while the backend ran.
  start         Same as restart but does not stop first (errors if already running).
  stop          Stop this project's servers: SIGTERM, then SIGKILL after the grace period
                (on Windows: taskkill /T /F at once).
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
  DMS_DEV_STOP_GRACE (default: 10 seconds between SIGTERM and SIGKILL; unused on Windows)
EOF
}

cmd="${1:-}"
case "$cmd" in
  restart)
    stop_servers || true
    start_servers restart
    ;;
  restart-back)
    restart_server backend
    ;;
  restart-front)
    restart_server frontend
    ;;
  start)
    require_dms_back_dir start
    refresh_process_table
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
