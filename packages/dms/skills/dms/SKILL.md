---
name: dms
description: Provides the core mental model and router for the AntelopeJS DMS. Use whenever building an app that uses the DMS, working in the @antelopejs/dms package or any DMS module (e.g. the official dms-* modules), building an admin page or dashboard, or when the user mentions the AntelopeJS DMS. Routes to dms-project, dms-module, dms-dev, and the sibling dms-pages / dms-auth skills.
category: overview
tags: [dms, architecture, mental-model, router]
---

# AntelopeJS DMS

The AntelopeJS DMS is a **backend-driven admin framework** built *on* AntelopeJS. Its own docs call
it the **DMS** ("dashboard management system") — same product; historical module names keep the
`dms-` prefix. It ships as the **`@antelopejs/dms`** package your project depends on — the
package these skills ship with. You add an admin screen by writing backend TypeScript — a page and
its components — and a shared Vue 3 + Inertia SSR frontend renders that description; you almost never write Vue.
For the framework underneath (the core, `ajs` CLI, interfaces as versioned contracts,
`ImplementInterface`), use the **antelopejs** plugin — the DMS assumes its mechanics.

## The model in one screen

- **Two coupled packages.** **`@antelopejs/dms`** is the backend: an AntelopeJS module
  providing the page system, component builders, DataTypes, auth, and platform services,
  auto-registering its **base Vue dashboard frontend** (`frontend-vue/`). **`@antelopejs/dms-frontend`**
  is the frontend loader (the `ajs dms` CLI): an Inertia SSR app whose single catch-all
  route renders the component tree the backend describes. In dev: two processes, `ajs project dev -w`
  (legacy alias: `ajs project run`) and `ajs dms dev` (auto-discovers a backend; `-b <url>` optional) —
  see **Running**.
- **Two ways to build — usually a project.** Most commonly you build a **project**: your own app
  loading the DMS via `antelope.config.ts`, registering *its own* pages and data — **dms-project**.
  Rarer: a **distributable module** (like `dms-database`) — **dms-module**. Same APIs; only packaging.
- **Pages are classes; UI is data.** A page extends `PageController(id, opts)` decorated with
  `@RegisterPage()`. Its **static fields are components** — `Form`, `TableView`, `Tree`, `Chart*`,
  `Grid`, `KpiCard`, … — fluent builders producing a **serializable description**, not live UI: the
  frontend renders it. **Components fetch their own data** via URLs (`fetchUrl`, `submitUrl`, …) —
  routes often declared `@Get`/`@Post` on the same page class; the backend stays the source of truth.
- **It's interfaces all the way down.** Everything you consume from the DMS is an AntelopeJS
  interface imported as an `@antelopejs/interface-dms/...` subpath (see the imports below);
  a distributable module exposes its own from a companion `@antelopejs/interface-<name>` package listed in `antelopeJs.implements`.

```ts
import { PageController, RegisterPage, pagesCategory } from "@antelopejs/interface-dms/page";
import { Form } from "@antelopejs/interface-dms/base/form";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
@RegisterPage()
export class SubmitRecipePage extends PageController("submit-recipe", {
  displayName: "Submit Recipe",
  icon: "i-ph-cooking-pot",
  category: pagesCategory, // attach under the dashboard's Pages section (the usual anchor)
}) {
  static form = Form({
    title: "Submit a Recipe",
    fields: [
      { id: "chef",  label: "Chef Name", type: new DefaultDataTypes.StringType({ maxLength: 100 }) },
      { id: "email", label: "Email",     type: new DefaultDataTypes.EmailType() },
    ],
  });
}
```

## Where to go next

| Task | Skill |
| --- | --- |
| **Set up a project that uses the DMS** — `antelope.config.ts`, lifecycle, `AddFrontendModule`, running | **dms-project** |
| Add an admin screen — pages, categories, components, DataTypes, routes that feed them | **dms-pages** |
| Protect a page or route, define and check permissions, users/roles/tenants | **dms-auth** |
| Run, stop, or restart the dev servers to test a change live | **dms-dev** |
| Package a *distributable* module — `antelopeJs` manifest, `RegisterModule` | **dms-module** |

The deep page/component and auth guidance ships **in this same package**: the sibling **dms-pages**
and **dms-auth** skills (under `skills/`, declared via `antelopeJs.skills`), carrying the concrete
package names and current API surface — route that work there. They are also auto-synced into
consumer projects' `.claude/skills/` by the **antelopejs** plugin's hooks and loaded by the dms-ai
chatbox.

## Docs & exact interface surfaces (read for depth)

Long-form reference docs live in this package's `docs/` directory (shipped with the package; also
at the repo root), in seven numbered sections — the last, `docs/07.interfaces/`, is the contract
reference for `@antelopejs/interface-dms` domain by domain. DataTypes, component builder options, and auth
decorators are **versioned interface contracts** — look them up rather than hand-recalling; treat
skill examples as patterns, not gospel. See [REFERENCE.md](REFERENCE.md) for the docs map and the
resolver commands that fetch an interface's exact surface.

## Running the DMS (use the dms-dev skill — don't reinvent it)

Backend and frontend are **coupled**: the `@antelopejs/dms-frontend` loader materializes layers into `~/.antelopejs/dms-frontend/` and
serves from those copies. Whenever anything looks stale (`RegisterModule "already registered"`, a
layer edit not showing, phantom UI state), the documented fix is a **full restart, backend first,
then frontend** — restart before verifying a change rather than trusting hot reload. The sibling
**dms-dev** skill owns this dance — use its bundled `scripts/dms-dev.sh` (invocation documented there).

## Conventions (enforced across all DMS repos)

The general rules live in this package's `AGENTS.md` (**pnpm only**, no `switch`/`case`, named interfaces, TSDoc-only comments, …) — match the surrounding code. Four DMS-specific rules:

- **Table rows use `_id`, not `id`.** Database records carry `_id`; don't alias to `id`.
- **Consumer-facing APIs must live in the interface package** — never a new runtime `package.json` export subpath.
- **`/** @internal */` marks the provider-side `internal` namespaces of interface files** (a repo-wide convention) — never strip it.
- **`pnpm build` only typechecks `src/`.** Frontend errors require the frontend lint/tests or a live verification (dms-dev); a clean root build does not mean the page renders.
