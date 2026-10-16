---
name: dms
description: Provides the core mental model and router for the AntelopeJS DMS. Use whenever building an app that uses the DMS, working in the @antelopejs/dms package or any DMS module (e.g. the official dms-* modules), building an admin page or dashboard, or when the user mentions the AntelopeJS DMS. Routes to dms-best-practices, dms-project, dms-pages, dms-auth, dms-module, dms-dev and dms-frontend.
icon: i-ph-squares-four
category: overview
tags: [dms, architecture, mental-model, router]
---

# AntelopeJS DMS

The AntelopeJS DMS ("dashboard management system") is a **backend-driven admin framework** built
*on* AntelopeJS. It ships as **`@antelopejs/dms`**, the package these skills ship with. You add an
admin screen by writing backend TypeScript — a page and its blocks — and a shared Vue 3 + Inertia SSR
frontend renders that description; you almost never write Vue. For the framework underneath (the
core, the `ajs` CLI, interfaces as versioned contracts, `ImplementInterface`), use the **antelopejs**
plugin.

## The model in one screen

- **Two coupled packages.** **`@antelopejs/dms`** is the backend: the page system, the block
  builders, DataTypes, auth and platform services, plus its base Vue dashboard (`frontend-vue/`).
  **`@antelopejs/dms-frontend`** is the frontend loader (`ajs dms`): an Inertia SSR app whose
  catch-all route renders what the backend describes. In dev: `ajs project dev -w` and `ajs dms dev`
  (see **dms-dev**).
- **Usually a project.** Most work is a **project** loading the DMS via `antelope.config.ts` and
  registering its own pages (**dms-project**). Rarer: a **distributable module** like `dms-database`
  (**dms-module**). Same APIs; only the packaging differs.
- **Pages are classes; UI is blocks.** A page extends `PageController(id, opts)` decorated with
  `@RegisterPage()`. Its **static fields are blocks** — `Form`, `TableView`, `Grid`, `KpiCard`,
  `ChartCard`, … — fluent builders producing a serializable description; every block type is
  registered in the block catalog (`ListBlockTypes()`). Each field and `.child()` is a permission.
- **Blocks fetch their own data** through URLs (`fetchUrl`, `submitUrl`), usually routes declared
  with `@Get` / `@Post` on the same page class, served under `/dms/pages<slug>` (name them with
  `pageRoutePath(slug, route)`); a plain `Controller` the frontend calls sits under
  `/api/<module>/`. A URL names the page's record with `{{params.id}}` /
  `{{query.X}}`; `periodScope` binds a block to a `PeriodSelector`; `realtimeTopic` re-fetches on a
  `PublishMessage`. Texts are `$` i18n keys or `ComposedText`, never formatted server-side.
- **It's interfaces all the way down.** Everything you consume is imported from an
  `@antelopejs/interface-dms/...` subpath; a distributable module exposes its own API from a companion
  `@antelopejs/interface-<name>` package listed in `antelopeJs.implements`.

```ts
import { PageController, RegisterPage, pagesCategory } from "@antelopejs/interface-dms/page";
import { Form } from "@antelopejs/interface-dms/base/form";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";

@RegisterPage()
export class SubmitRecipePage extends PageController("submit-recipe", {
  displayName: "$cookbook.submit.title",
  icon: "i-ph-cooking-pot",
  category: pagesCategory,
}) {
  static form = Form({
    title: "$cookbook.submit.form_title",
    fields: [
      { id: "chef", label: "$cookbook.submit.chef", type: new DefaultDataTypes.StringType({ maxLength: 100 }) },
      { id: "email", label: "$cookbook.submit.email", type: new DefaultDataTypes.EmailType() },
    ],
  });
}
```

## Where to go next

| Task | Skill |
| --- | --- |
| **Before building or changing any page**, before writing a `CustomComponent`, or when the user hands you a design, mockup or screenshot | **dms-best-practices** |
| Set up a project that uses the DMS — `antelope.config.ts`, lifecycle, `AddFrontendModule` | **dms-project** |
| Add a screen — pages, categories, blocks, DataTypes, the routes that feed them | **dms-pages** |
| Protect a page or route, define and check permissions, users / roles / tenants | **dms-auth** |
| Run, stop or restart the dev servers to test a change live | **dms-dev** |
| Package a *distributable* module — `antelopeJs` manifest, `RegisterModule`, its own skill | **dms-module** |
| The `ajs dms` CLI, a frontend module's `dms.server.ts` / `dms.frontend.build.ts`, building and deploying the frontend server (ships with `@antelopejs/dms-frontend`) | **dms-frontend** |

These skills ship in this package (`skills/`, declared via `antelopeJs.skills`). The **antelopejs**
plugin links them into a project's `.claude/skills/`, and the dms-ai assistant loads them for every
loaded module.

## Docs & exact interface surfaces

The long-form docs live in this package's `docs/` directory, and the exact surface of
`@antelopejs/interface-dms` is a versioned contract: look it up rather than recall it, and treat skill
examples as patterns. [REFERENCE.md](REFERENCE.md) maps the docs and gives the resolver commands.

## Running the DMS

Backend and frontend are **coupled**: the loader materializes layers into
`~/.antelopejs/dms-frontend/` and serves those copies. When anything looks stale
(`RegisterModule "already registered"`, a layer edit not showing), the fix is a **full restart,
backend first, then frontend** — the **dms-dev** skill and its `scripts/dms-dev.sh` own that.

## Conventions (enforced across all DMS repos)

The general rules live in the repo's `AGENTS.md` (**pnpm only**, no `switch` / `case`, named
interfaces, TSDoc-only comments, …). Four DMS-specific rules:

- **Table rows use `_id`, not `id`.** Database records carry `_id`; never alias it to `id`.
- **Consumer-facing APIs live in the interface package** — never a new runtime `package.json` export subpath.
- **`/** @internal */` marks the provider-side `internal` namespaces** of interface files — never strip it.
- **`pnpm build` only typechecks `src/`.** Frontend errors need the frontend lint / tests or a live check (**dms-dev**).
