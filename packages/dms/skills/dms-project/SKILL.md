---
name: dms-project
description: Sets up and runs an AntelopeJS project that uses the DMS — template, `antelope.config.ts`, the `src/index.ts` lifecycle, `AddFrontendModule` — and starts, stops or restarts its backend and frontend dev servers with a bundled script. Use when creating or configuring a DMS app, wiring the modules it loads, running or restarting the dev servers, reading their logs, or when a change does not show live.
icon: i-ph-folder-simple-plus
category: setup
tags: [project, setup, config, lifecycle, dev-server, restart]
allowed-tools: Bash(bash:*), Bash(pgrep:*), Bash(tail:*), Bash(curl:*), Read, Write
---

# Setting up and running a DMS project

This is the **most common** way to use the DMS: a normal AntelopeJS **project** (an app) that loads
the DMS as a dependency and registers *its own* admin pages, data, and logic — rather than a
distributable DMS module (to ship a reusable extension instead, see **dms-module** — same APIs,
different packaging). For the model see **dms**; for `ajs` CLI / module-loading mechanics
the **antelopejs** plugin; full walkthrough: `docs/02.building/01.project-setup.md`.

## Starting a new application

Use [template-dms-demo](https://github.com/AntelopeJS/template-dms-demo) for the default
CLI-owned backend and Nuxt dashboard. Follow `docs/01.getting-started/03.quickstart.md`
through first-admin setup before adding pages. Use
[template-dms-adonis](https://github.com/AntelopeJS/template-dms-adonis) only when
AdonisJS must own the process. Evaluate these existing templates before proposing another.

Preserve the package names declared by the template. Both templates ship `.claude/settings.json`, which makes Claude Code offer the
**antelopejs** plugin; elsewhere, install it once with `claude plugin marketplace add
AntelopeJS/agent-skills` and `claude plugin install antelopejs@antelopejs`. In Codex, run
`codex plugin marketplace add AntelopeJS/agent-skills`, install `antelopejs` from `/plugins`, and
sync the skills with `npx -y github:AntelopeJS/agent-skills sync --target codex`.

## What a project is

An AntelopeJS app whose `antelope.config.ts` loads **`@antelopejs/dms`** (+ the
infrastructure it needs) and whose own `src/` is the `local` module. It provides no interfaces, so
its `package.json` has **no `antelopeJs.implements`** (that field marks a distributable module);
deps are `@antelopejs/dms` + the interface libs, plus `@antelopejs/dms-frontend` (the
`ajs dms` CLI) as a dependency — the template keeps it in `dependencies`; a devDependency also works
since it is only a CLI. The frontend attaches at runtime with `AddFrontendModule`, and the DMS
**auto-registers its base dashboard layer** (shell, login, component vocabulary) — a pages-only
project needs no `frontend-vue/` of its own.

## Wiring `antelope.config.ts`

Declare the modules to load. Your code is the `local` module; the DMS and its infra are packages
(or git, from a checkout). The `<latest>` pins below are placeholders, not installable versions.
Copy the complete module stack and compatible ranges from `template-dms-demo/antelope.config.ts`;
`docs/02.building/01.project-setup.md` explains the local module and lifecycle.

```ts
import { defineConfig } from "@antelopejs/interface-core/config";
export default defineConfig({
  name: "my-app",
  modules: {
    local: { source: { type: "local", path: ".", watchDir: ["src"],
                       installCommand: ["pnpm install", "pnpm build"], reloadCommand: "pnpm exec tsc" },
             config: { /* your project Config → construct(config) */ } },
    dms: {
      source: { type: "package", package: "@antelopejs/dms", version: "<latest>" }, // or type:"git" from a checkout
      config: { apiBaseUrl: "http://localhost:5010", clientBaseUrl: "http://localhost:3001" } },
    mongodb: { source: { type: "package", package: "@antelopejs/mongodb", version: "<latest>" },
               config: { url: "mongodb://127.0.0.1:27017", database: "myapp" } },
    // …plus @antelopejs/api (servers + cors) and @antelopejs/auth-jwt (secret) — same shape.
  },
});
```

The DMS needs an **API** (HTTP server), a **database** (e.g. mongodb), and **auth-jwt**. The DMS's
`auth.jwtSecret` (its session tokens) and auth-jwt's `secret` are **independent secrets** — set
both; remaining DMS keys: `docs/02.building/02.configuration.md`. Optional infrastructure (redis,
file storage, email), the standalone `data-api` note, and `envOverrides` / `environments` are in
[REFERENCE.md](REFERENCE.md).

## The project lifecycle (`src/index.ts`)

Your project is a module with the standard lifecycle. `construct(config)` gets the `local` config;
register everything there. Side-effect imports run your decorators.

```ts
import "./data-types"; import "./db"; import "./pages"; import "./data-api"; import "./routes";
import { resolve } from "node:path";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";
import { registerAllPermissions } from "./permissions";

export function construct(config: Config): void {
  globalConfig = config;
  registerAllPermissions();  // RegisterPermission(...) — see dms-auth
  RegisterHook(Hook.DATABASE_INITIALIZED, async () => {
    await initDatabase();
  });
}
export async function start(): Promise<void> {
  AddFrontendModule({       // OPTIONAL — only if you ship custom Vue
    name: "my-app-frontend",
    sourcePath: resolve(__dirname, "../frontend"),
    renderer: { name: "vue", version: "3" },
    options: {},
    privateOptions: {},
    // priority: 1,  // higher than the base module (0) to take one of its component names
  });
}
export function stop(): void {}
export function getConfig(): Config { return globalConfig; }
```

Frontend wiring is the `AddFrontendModule` call alone — no DMS config entry. A **project** attaches the
layer from `start()`; a **distributable module** attaches it in `construct` (see **dms-module**).
Full layer authoring: `docs/02.building/08.frontend-layer.md`.

## What you register (delegates to the other skills)

Pages and components → **dms-pages**; auth, permissions, tenants → **dms-auth**; backend services
and custom Vue → the doc map in [REFERENCE.md](REFERENCE.md). Pages usually attach to a `Category`
under the built-in `pagesCategory` (`RegisterModule` is for distributable modules). DB models use
`@antelopejs/interface-database-decorators`; routes use `@antelopejs/interface-api`.

## Running the dev servers

A DMS project runs two coupled processes, both started from the project's DMS backend package
directory:

- **Backend**: `ajs project dev -w` (`ajs project run` is the legacy alias; `-e STAGING` picks an
  environment). Ready when its log prints `Server started, listening on <url>`;
  `.antelope/dev.json` records the real endpoint (`http://localhost:5010` by default). Projects
  often start Mongo / Redis in Docker first (`docker-compose up -d`).
- **Frontend**: the `@antelopejs/dms-frontend` loader, `ajs dms dev`. It finds the running backend
  through `.antelope/dev.json`, so `-b <apiBaseUrl>` is optional. Ready when its log prints
  `Dev server ready` and a `Local: <url>` line (`http://localhost:3001` by default).

Start the backend first and wait for its ready line, **then** the frontend: the loader copies the
backend's layers into `~/.antelopejs/dms-frontend/` at startup, and a frontend started too early
serves stale or empty copies. Every `ajs dms` command and flag, a frontend module's files, and
building or deploying the frontend server belong to the **dms-frontend** skill (shipped by
`@antelopejs/dms-frontend`); production is `docs/02.building/11.deployment.md`.

### Never from inside the DMS

An agent running inside the DMS (the dms-ai assistant, whose sidecar the backend spawns, or any
process these dev servers started) **leaves the servers running**: stopping the backend takes the
agent down with it. It relies on hot reload and, when a change needs a full restart, asks the user
to run it. The script refuses to stop a process tree that contains its calling shell.

### Hot reload first, restart when it cannot apply

The watchers propagate most edits (backend `-w` recompile, live layer resync). Restart only when
hot reload cannot apply the change: a new module or dependency, a config edit, a backend log
showing a failed rebuild, or a behaviour still stale after the watcher reported the rebuild
(`RegisterModule` "already registered", a layer edit not showing). Then restart both, backend
first.

### Drive the bundled script

`scripts/dms-dev.sh` (under this skill's base directory, announced when the skill loads) does the
work. It needs `DMS_BACK_DIR`, the absolute path of the DMS backend package directory: take it from
the current repository when `package.json` and `antelope.config.ts` make it unambiguous, otherwise
follow [DEV-SERVERS.md](DEV-SERVERS.md#resolve-the-backend-path).

```sh
DMS_BACK_DIR=<resolved-path> bash "<skill-base-dir>/scripts/dms-dev.sh" restart
```

| Command | Use when |
| --- | --- |
| `restart` | Hot reload cannot apply a change, or the state is unknown. |
| `start` | Nothing is running (fresh shell, after `stop`). |
| `stop` | Before walking away, before destructive operations, on session cleanup. |
| `status` | The user asks whether the DMS is running. |
| `back-log [N]` / `front-log [N]` | A boot fails: read the last N (default 60) lines of `/tmp/dms-back.log` / `/tmp/dms-front.log`. |

The call returns once both servers print their ready line and reports the URLs they listen on; it
fails fast when a server exits early, otherwise after 180 s per server (`DMS_DEV_TIMEOUT`). The
servers keep running detached. By default the script runs the project's `pnpm dev` and
`pnpm frontend:dev` scripts (a project convention that expands to the two commands above);
override them with `DMS_BACK_CMD` / `DMS_FRONT_CMD`.

When you hand off for manual testing, run `restart` yourself, wait for both ready lines, then tell
the user what to click. Boot failures, stale frontends, a refused credential (401), stop scope and
managed environments (Amp orbs): [DEV-SERVERS.md](DEV-SERVERS.md).
