---
name: dms-project
description: Sets up an AntelopeJS project that uses the DMS, including its Inertia frontend module and lifecycle.
category: setup
tags: [project, setup, config, lifecycle, frontend, inertia]
---

# Building a project on the DMS

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

Preserve the package names declared by the template.

## What a project is

An AntelopeJS app whose `antelope.config.ts` loads **`@antelopejs/dms`** (+ the
infrastructure it needs) and whose own `src/` is the `local` module. It provides no interfaces, so
its `package.json` has **no `antelopeJs.implements`** (that field marks a distributable module);
deps are `@antelopejs/dms` + the interface libs, plus `@antelopejs/dms-frontend` (the
`ajs-dms` CLI) as a dependency — the template keeps it in `dependencies`; a devDependency also works
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
    return undefined;
  });
}
export async function start(): Promise<void> {
  AddFrontendModule({       // OPTIONAL — only if you ship custom Vue
    name: "my-app-frontend",
    sourcePath: resolve(__dirname, "../frontend"),
    renderer: { name: "vue", version: "3" },
    options: {},
    privateOptions: {},
    // priority: -1,  // negative to override base-layer components (base sits at 0)
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

## Running

- Backend: `ajs project dev -w` (`ajs project run` is the legacy alias; `-e STAGING` picks an
  environment). Projects often start Mongo/Redis in Docker first (`docker-compose up -d`).
- Frontend: the `@antelopejs/dms-frontend` loader, `ajs-dms dev` — auto-discovers the running
  backend via `.antelope/dev.json`, so `-b <apiBaseUrl>` is optional.

The `pnpm dev` / `frontend:dev` script names are **your project's conventions** — they expand to
`ajs project dev` and `ajs-dms dev`. Whenever a change doesn't show (or you're about to verify one),
full-restart both, backend first — see **dms-dev**. Production: `docs/02.building/11.deployment.md`.
