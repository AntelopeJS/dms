---
name: dms-dev
description: Starts, stops, or restarts the AntelopeJS DMS backend and Inertia frontend.
category: tooling
tags: [dev-server, restart, backend, inertia, workflow]
allowed-tools: Bash(bash:*), Bash(pkill:*), Bash(pgrep:*), Bash(tail:*), Bash(curl:*), Read, Write
---

# dms-dev

Owns the dev-server lifecycle for an AntelopeJS DMS project. Ships with the
`@antelopejs/dms` package's skills; the bundled `dms-dev.sh` (in this skill's
`scripts/` directory) does the work, and this skill tells you how to drive it and how to
resolve the project path. For authoring see the sibling **dms**, **dms-module**,
**dms-pages**, and **dms-auth** skills.

## Choose the process manager

In an Amp orb, use the repository's `.amp/services.yaml` with `amp orb services ensure`,
or `amp orb service start` for a one-off service. Inspect readiness with service logs and
HTTP checks; share the returned portal URL for browser review. The bundled detached-shell
script is for local shells, not managed orbs: its processes do not survive orb updates.

## Why full restart, not hot reload

The DMS has two coupled processes, both started from the DMS backend package directory:

- **Backend**: the AntelopeJS project — `ajs project dev -w` (`ajs project run` is the legacy alias). Listens on `http://localhost:5010`. Ready when the log emits `Server started, listening on http://localhost:5010`.
- **Frontend**: the `@antelopejs/dms-frontend` loader — `ajs dms dev`. It auto-discovers the running backend via `.antelope/dev.json`, so `-b <backend-url>` is optional. Listens on `http://localhost:3001`. Ready when the log emits `Local: http://localhost:3001/`.

By default the script runs each via the project's `pnpm dev` / `pnpm frontend:dev` scripts — a convention our playground projects adopt that expands to the two commands above. Those script names aren't shipped by the DMS, so if a project starts its servers differently, override the actual commands with the `DMS_BACK_CMD` / `DMS_FRONT_CMD` env vars (the script reads them; readiness detection and process cleanup already cover `ajs`, `ajs dms`, and the loader's Node entry point directly).

Order matters: start the backend first and wait for ready, **then** start the frontend. The frontend materializes the backend's layers into a `~/.antelopejs/dms-frontend/` workspace at startup; starting it before the backend is up produces stale or empty layer copies.

The docs claim dev-mode watchers normally propagate edits (backend `-w` recompile, live layer resync into `~/.antelopejs/dms-frontend/`) — and they often do. But the failure modes are silent: `RegisterModule` can throw "already registered" on rebuild, and a missed resync serves a stale layer copy that *looks* like your bug. The documented troubleshooting recipe — and this skill's contract as an agent — is: **full restart both, backend first, before verifying any change**. A 60-second restart beats debugging a phantom.

## Resolving the backend path (do this FIRST, eagerly)

The script needs `DMS_BACK_DIR` set to the absolute path of the project's DMS backend package directory (the one whose scripts start the AntelopeJS backend and Inertia frontend). Resolve it the **first time this skill loads in a session**.

Resolve in this order:

1. **Inspect the current repository** for `package.json`, `antelope.config.ts`, and service configuration. Use the project they identify when the path is unambiguous.
2. **Check project memory** for a reference memory named `dms-back-path`. If it exists, verify that the directory still exists and contains a `package.json`; otherwise treat the memory as stale.
3. **Ask only if the path is still ambiguous**: "Which AntelopeJS DMS project should I run? Give me the absolute path to its DMS backend package directory." Verify the answer, then save it as a reference memory so future invocations skip the prompt:

   ```markdown
   ---
   name: dms-back-path
   description: Absolute path to the DMS backend package directory for this project, used by the dms-dev skill to run pnpm dev / pnpm frontend:dev.
   metadata:
     type: reference
   ---

   /absolute/path/to/the-backend-package
   ```

   Also add the index line to `MEMORY.md`: `- [DMS backend path](dms-back-path.md) — where dms-dev runs pnpm dev / pnpm frontend:dev`.

Once resolved, export it for the script invocation:
`DMS_BACK_DIR=<path> bash "<skill-base-dir>/scripts/dms-dev.sh" <command>`.

## How to invoke

```sh
DMS_BACK_DIR=<resolved-path> bash "<skill-base-dir>/scripts/dms-dev.sh" restart
```

`<skill-base-dir>` is this skill's base directory — announced when the skill loads; the
bundled script lives at `scripts/dms-dev.sh` under it. Subcommands:

| Command           | Use when                                                                |
|-------------------|-------------------------------------------------------------------------|
| `restart`         | After any source edit, or unconditionally if you don't know the state.  |
| `start`           | When you're sure nothing is running (fresh shell / after `stop`).       |
| `stop`            | Before walking away, before destructive operations, on session cleanup. |
| `status`          | Quickly check what's running.                                           |
| `back-log [N]`    | Read the last N (default 60) backend log lines. Use to diagnose boot.   |
| `front-log [N]`   | Same for the frontend log.                                              |

The script writes the long-running server logs to `/tmp/dms-back.log` and `/tmp/dms-front.log`. The `Bash` tool invocation completes as soon as both servers print their ready strings (or after a 180 s timeout per server — worst case ~6 minutes for a restart; override with `DMS_DEV_TIMEOUT`). The servers themselves keep running detached via `setsid nohup` so they survive the Bash call exiting.

## When to reach for the subcommands

- The user edits any `.ts` or `.vue` file under the DMS backend package or under a DMS module's `src/` or `frontend-vue/` and then wants to test the change live. Run `restart` unconditionally — don't try hot reload.
- The user says "restart the dms", "restart servers", "reload", or "test it now". Run `restart`.
- A browser smoke test fails in a way that looks like stale state. Run `restart` before diagnosing.
- The user asks "is the dms running?". Run `status`.
- A boot fails (backend never prints "Server started" or frontend never prints "Local:"). Print the relevant `back-log` / `front-log` tail to diagnose; common causes include `RegisterModule … already registered` (a previous stop failed — run `stop` then `restart`), port already in use (kill the listed PID), or a missing dependency (run `pnpm install` in the offending module).
- **You are handing off to the user for manual testing** (e.g. a plan phase whose acceptance criterion is "user verifies in browser"). Run `restart` yourself first, wait for both ready strings, and only *then* tell the user what to click. Never ask the user to start the servers themselves — that's the whole reason this skill exists.

## Common pitfalls

- **Zombie frontend processes.** The frontend CLI can spawn child processes that survive `pkill ajs`. The script's `stop` does an automatic second-pass kill via `pgrep | xargs kill -9` to catch them. If `start` reports servers already running, run `stop` and check that `status` shows `(none)` before starting again.
- **Backend exits with "Module already registered".** Means a previous instance is still holding the registration. Run `stop` to clear it, then `restart`.
- **Frontend's "auth redirect" 302** on `/modules/...` URLs is **normal** — it's the auth-protected admin routes. The frontend layer is loaded correctly even when curl returns 302. Don't restart on this alone; have the user log in.
- **Don't run `start` or `restart` more than once concurrently** in a single session — the second invocation will hit a port/lock conflict. If multiple background Bash tasks are queued, use the foreground `restart`.
- **Stale `dms-back-path` memory.** If the saved path no longer exists or the user has switched projects, the script will fail fast with a clear error. Re-prompt the user and overwrite the memory entry.
- **Stubbornly stale frontend after restarts.** The loader serves layers from physical copies under `~/.antelopejs/dms-frontend/<hash>/`. If a layer edit still doesn't show after a full restart, reset the workspaces with `ajs dms clean --all` (run in the backend package dir — bare `ajs dms clean` exits with an error asking for `-b` or `--all`, and `-b <url>` misses autodiscovered workspaces, which are keyed by project path), then `restart`.
- **`ajs dms` reports a refused credential (401), or the backend logs "no valid bootstrap credential".** The frontend authenticates to the layer endpoints with the ephemeral secret a dev backend publishes to `<project>/.antelope/dms-dev.json`. A 401 means that file is absent (backend not in dev mode), or stale — it outlives the backend that wrote it, exactly like `dev.json`, so a stopped instance leaves one behind whose pid no longer resolves. `restart` rewrites it. If the frontend runs outside the project tree, give it `DMS_BOOTSTRAP_SECRET` explicitly.

## Don't

- Don't try to hot-reload by editing files and refreshing the browser without `restart`. It will work intermittently and waste debugging cycles on phantom issues.
- Don't `pkill -9 node` — it kills unrelated processes. The script targets specific patterns (`antelope-runner`, `ajs project run|dev`, `ajs dms dev`, and paths ending in `dms-frontend/dist/index.js dev`).
- Don't hardcode a backend path into a session. Always resolve via memory-or-prompt so the skill works across projects.
- Don't ask the user to start or restart the servers themselves before manual testing. You have the script — run it, wait for ready, then hand off. Asking the user to do it defeats the point of the skill and breaks the testing loop.
