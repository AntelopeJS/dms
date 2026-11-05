# dms-project — dev servers reference

Details behind the **Running the dev servers** section of [SKILL.md](SKILL.md): resolving the
project path, choosing the process manager, what `stop` touches, and the failures that look like
bugs.

## Resolve the backend path

`DMS_BACK_DIR` is the absolute path of the project's DMS backend package directory (the one whose
scripts start the AntelopeJS backend and the frontend loader). Resolve it before the first script
call of a session, in this order:

1. **The current repository.** Use the project that `package.json`, `antelope.config.ts` and any
   service configuration identify, when the path is unambiguous.
2. **Project memory.** Read the reference memory named `dms-back-path`. Use it only if the
   directory still exists and contains a `package.json`; otherwise treat it as stale.
3. **The user**, when the path is still ambiguous: "Which AntelopeJS DMS project should I run?
   Give me the absolute path to its DMS backend package directory." Verify the answer, then save it
   as a reference memory so later sessions skip the question:

   ```markdown
   ---
   name: dms-back-path
   description: Absolute path to the DMS backend package directory for this project, used by the dms-project skill to run pnpm dev / pnpm frontend:dev.
   metadata:
     type: reference
   ---

   /absolute/path/to/the-backend-package
   ```

   Add the index line to `MEMORY.md`: `- [DMS backend path](dms-back-path.md) — where dms-project runs pnpm dev / pnpm frontend:dev`.

A saved path that no longer exists makes the script fail fast with a clear error: ask again and
overwrite the memory.

## Choose the process manager

The script is for local shells.

## What `stop` and `restart` touch

Only the project in `DMS_BACK_DIR`. The script records the pids it starts in
`DMS_BACK_DIR/.antelope/dms-dev.pid`; without that file it matches only dev processes whose working
directory or command line lies under `DMS_BACK_DIR`. Each process gets SIGTERM, then SIGKILL after
`DMS_DEV_STOP_GRACE` seconds (default 10); on Windows, `taskkill /T /F` ([below](#windows)). Other projects' dev servers on the machine keep running,
which is why the script replaces `pkill` by name (`pkill -9 node`, `pkill -f antelope-runner`).

`restart-back` and `restart-front` touch one server only: the pid the pid file records for it
(`backend` or `frontend`) and its process tree, or, when that pid is gone (the server crashed),
the processes of that server alone that the scan below finds. The other server keeps running.

Run one `start` or `restart` at a time: a second concurrent call hits a port or lock conflict.

## Several worktrees side by side

Each project keeps its own pid file and logs, so projects only collide on ports, MongoDB and
temporary files. `antelopejs-lease` (in the project's tooling-configs) hands a command its own set
of those. Prefix the script with it:

```sh
DMS_BACK_DIR=<resolved-path> pnpm exec antelopejs-lease run -- bash "<skill-base-dir>/scripts/dms-dev.sh" start
```

The lease sets `DMS_BACK_PORT` and `DMS_FRONT_PORT`, never `PORT`. The script turns each into
`PORT` for its own process only, because `ajs dms dev` and the DMS playground's
`antelope.config.ts` read `PORT` and would otherwise share one port. Without the variables nothing
changes: no `PORT` is set and the reported URLs default to `5010` and `3001`; with them, to those
ports.

Pass `DMS_BACK_CMD` / `DMS_FRONT_CMD` overrides through the environment, not as arguments of a wrapper command (`antelopejs-lease run -- env DMS_BACK_CMD=… bash dms-dev.sh start`): the script's process search can otherwise match the wrapper's command line.

After the backend's ready line, `start` also waits (within `DMS_DEV_TIMEOUT`) until `GET /dms/frontend?renderer=vue&rendererVersion=3`, the request the dashboard makes first, answers 200, 401 or 403. The ready line can print before the modules have loaded, and the manifest answers 503 until they have, which made the dashboard exit when several backends started at once. The wait is skipped without `curl`, without a `.antelope/dev.json`, or when nothing accepts connections on the recorded port.

A config that hard-codes the api port (most DMS repos pin `5010`) ignores `PORT`. Two such projects
still start side by side: in dev mode the second backend listens on the next free port and logs
`Port <n> in use, listening on <url> instead.`, and the script treats that line as ready. The
backend URL it reports comes from `.antelope/dev.json`, which records the port actually bound, and
the dashboard finds the backend through that same file.

Logs default to `<DMS_BACK_DIR>/.antelope/logs/back.log` and `front.log` (ignored by git with the
rest of `.antelope`); `status` prints both paths. `DMS_BACK_LOG` / `DMS_FRONT_LOG` override them.

## Windows

The script runs in Git Bash, MSYS2 or Cygwin. Their `ps` lists only their own processes and takes
no `-o`, and they have no `setsid`, while the dev servers run as native `node.exe` processes. So on
Windows the script:

- reads the Windows process table through PowerShell (`Get-CimInstance Win32_Process`: pid, parent
  pid, creation time, command line), and maps the pids it recorded to Windows pids through
  `/proc/<pid>/winpid`;
- follows parent pids for the tree (Windows has no process groups), counting only children created
  after their parent, so that a process holding a dead parent's reused pid is left alone;
- stops each tree at once with `taskkill /T /F`: a console node process handles no SIGTERM, so
  there is no grace period (`DMS_DEV_STOP_GRACE` is unused);
- without a pid file, matches only processes whose command line names `DMS_BACK_DIR`: a native
  process exposes no working directory. Servers started through `pnpm` rarely do (only binaries
  installed in the project's `node_modules` show its path), so start them with the script, which
  records their pids.

## Pitfalls

- **Zombie frontend processes.** The frontend CLI spawns children. `stop` signals the whole
  session and process tree it started. If `start` reports servers already running, run `stop`
  and check that `status` shows `(none)` before starting again.
- **Backend exits with "Module already registered".** A previous instance still holds the
  registration: `stop`, then `restart`.
- **A boot that never gets ready.** Read `back-log` / `front-log`. Common causes: "already
  registered" (above), a port already in use (kill the listed pid), a missing dependency
  (`pnpm install` in the offending module).
- **A 302 on `/modules/...` URLs is normal**: those admin routes require a login. The layer is
  loaded; have the user log in rather than restarting.
- **A frontend still stale after restarts.** The loader serves layers from copies under
  `~/.antelopejs/dms-frontend/<hash>/`. Reset them with `ajs dms clean --all` in the backend
  package directory (bare `ajs dms clean` asks for `-b` or `--all`, and `-b <url>` misses
  autodiscovered workspaces, which are keyed by project path), then `restart`.
- **`ajs dms` reports a refused credential (401), or the backend logs "no valid bootstrap
  credential".** The frontend authenticates to the layer endpoints with the ephemeral secret a dev
  backend publishes to `<project>/.antelope/dms-dev.json`. A 401 means that file is absent
  (backend not in dev mode) or stale: it outlives the backend that wrote it. `restart` rewrites
  it. A frontend running outside the project tree needs `DMS_BOOTSTRAP_SECRET`.
