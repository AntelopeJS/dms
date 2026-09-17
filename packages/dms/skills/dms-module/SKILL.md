---
name: dms-module
description: Packages a DISTRIBUTABLE DMS extension module (a reusable module other projects install, like the official dms-* modules — the package name itself is free). Use when creating a publishable DMS module, editing its package.json antelopeJs.implements manifest, registering it with RegisterModule, or defining the module's own AntelopeJS interface. For an app that just USES the DMS, see dms-project instead.
category: packaging
tags: [module, packaging, distribution, interfaces, frontend, inertia]
---

# Building a distributable DMS module

> **Most work on the DMS is a project, not a module.** An app that loads the DMS and registers
> its own pages wants **dms-project** — not this. This skill is the rarer case: packaging a
> reusable extension to *ship* to other projects (the way the official `dms-*` modules do).
> The page/component/auth APIs are identical to a project; only the packaging differs.

For the mental model see the **dms** skill; for the framework underneath
(`ImplementInterface`, the `ajs` CLI) see the **antelopejs** plugin. A DMS module is an
ordinary AntelopeJS module that (1) depends on **`@antelopejs/dms`**, (2) registers a
module + pages on load, and (3) attaches a Vue 3 module via `AddFrontendModule` for any custom
frontend. A consumer installs it and adds it to their `antelope.config.ts` as a
`package`/`git` module — not as the project's `local` module. The official modules are the
reference implementations; full walkthrough: `docs/02.building/10.distributable-module.md`.
See [REFERENCE.md](REFERENCE.md) for the directory layout, the full `package.json` manifest,
defining the module's own interface, and the scaffolding checklist.

## The `package.json` manifest

The `antelopeJs` block is what makes it a DMS module ([REFERENCE.md](REFERENCE.md) has the full
manifest, including the `exports`/`typesVersions` entries for an interface subpath).
`implements` lists only the interfaces the module *provides* — the official modules keep it `[]`
when they provide none (`dms-lang`, `dms-saas`); consumed interfaces are plain `dependencies`
(no manifest field). Typical dependencies: `@antelopejs/dms` plus
`@antelopejs/interface-{core,api,api-util,auth,database,database-decorators}`. The frontend is
attached at runtime by the `AddFrontendModule` call in `construct`; there is no manifest field for it.

## The lifecycle entry (`src/index.ts`)

The AntelopeJS loader calls four optional exports. Register everything in `construct`; start
runtime work in `start`; tear down in `stop`/`destroy`. Side-effect imports (`import "./pages"`)
run the `@RegisterPage` decorators.

```ts
import "./db";
import "./pages";
import path from "node:path";
import { ImplementInterface } from "@antelopejs/interface-core";
import { AddFrontendModule, RegisterModule } from "@antelopejs/interface-dms/page";

export const myModule = RegisterModule({
  id: "<name>",                       // the module id pages attach to (module: "<name>")
  title: "$dms_<name>.title",         // i18n key — add it to every locale file
  description: "$dms_<name>.description",
  icon: "i-ph-cube",
  // landingPage: "<page-id>",   defaultCategory: { displayName: "…", icon: "…", order: 0 },
});

export async function construct(config: Config): Promise<void> {
  void ImplementInterface(            // wire the module's own interface to its implementation, if any
    await import("<your-interface-package>"),   // the companion @scope/interface-<name> package
    await import("./implementations/<name>"),
  );
  AddFrontendModule({
    name: "<your-module-package>",
    sourcePath: path.join(__dirname, "../frontend"),
    renderer: { name: "vue", version: "3" },
    options: {},
    privateOptions: {},
    // priority: 1,                   // higher than the base module (0) to take one of its component names
  });
}

export async function start(): Promise<void> { /* RegisterSchema("<name>") once the DB is up; cron, caches */ }
export function stop(): void { /* stop cron, release resources */ }
export function destroy(): void { /* deactivate subscriptions */ }
```

`RegisterModule` runs at import time (top level), so the module exists before its pages
register — it returns the module's root `CategoryInfo`. `AddFrontendModule` is what surfaces the
module's frontend; without it the module is backend-only.

## Navigation & access — module pages are owner-only

Three constraints are enforced at registration: a page's `category` must **descend from the
module root** (nest under what `RegisterModule` returned, or rely on `defaultCategory`),
module pages cannot use the Settings category, and the module must exist before a page names
it. Pages resolve at `/modules/<moduleId>/<urlSlug>`; entering the module lands on
`landingPage` if set, else the first page by `order`. Access is **owner-only by design**: the
Modules group is visible to the platform owner alone (the `*` holder), and the
`modules.<moduleId>.…` permission ids are module-scoped — never grantable through Roles. On a
SaaS deployment that means you, the maker, not your customers; a screen for end users belongs
in a **project** page instead.

## Build, verify, reload

- `pnpm build` compiles `src/` only (`tsc`) — Vue template/compile errors surface only in the
  running frontend. When a change doesn't show — or `RegisterModule` throws "already
  registered" on rebuild — **full-restart via the dms-dev skill** (its pitfalls also cover
  stubbornly stale `~/.antelopejs/dms-frontend` workspaces).

## Scaffolding (no DMS-specific generator)

`ajs module init <path>` scaffolds a **generic** AntelopeJS module shell; nothing generates the
DMS shape (a companion interface package, `frontend-vue/`, `Dms<Name>` prefix, i18n keys) — follow the
checklist in [REFERENCE.md](REFERENCE.md), and keep the repo conventions (**dms**:
pnpm only, `_id` rows, no `switch`/`case`, TSDoc-only comments).
