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
