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

The script is for local shells. In an Amp orb, use the repository's `.amp/services.yaml` with
`amp orb services ensure`, or `amp orb service start` for a one-off service; check readiness with
service logs and HTTP checks and share the returned portal URL. Processes the script detaches do
not survive orb updates.

## What `stop` and `restart` touch

Only the project in `DMS_BACK_DIR`. The script records the pids it starts in
`DMS_BACK_DIR/.antelope/dms-dev.pid`; without that file it matches only dev processes whose working
directory or command line lies under `DMS_BACK_DIR`. Each process gets SIGTERM, then SIGKILL after
`DMS_DEV_STOP_GRACE` seconds (default 10). Other projects' dev servers on the machine keep running,
which is why the script replaces `pkill` by name (`pkill -9 node`, `pkill -f antelope-runner`).

Run one `start` or `restart` at a time: a second concurrent call hits a port or lock conflict.

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
