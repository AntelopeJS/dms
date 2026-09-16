---
name: dms-pages
description: Declares admin pages and composes backend-driven UI on the AntelopeJS DMS. Use when adding a dashboard screen, writing a @RegisterPage / PageController class, composing Form / TableView / Tree / Chart / Grid builders imported from @antelopejs/interface-dms/base, or choosing DataTypes and wiring the routes and DataControllers that feed them.
category: dashboard
tags: [pages, components, forms, tables, data-types, navigation]
---

# Pages & components

The DMS is backend-driven: you declare a **page** and attach **components** to it as static
fields. The builders produce a serializable description that the shared Vue 3 + Inertia frontend
renders — you write no Vue for standard screens. Depth: `docs/02.building/03.pages-and-components.md`
(pages), `docs/02.building/04.navigation.md` (nav tree), and the `docs/04.components/`
catalog (one chapter per component family).

## Declaring a page

A page is a class extending `PageController(id, options)` decorated with `@RegisterPage()`.
Registration happens at import time — make sure `src/index.ts` imports your pages module.

```ts
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";

@RegisterPage()
export class RecipesPage extends PageController("recipes", {
  displayName: "Recipes",     // sidebar label (use a "$dms_x.y" i18n key in real modules)
  icon: "i-ph-cooking-pot",   // any iconify name
  module: "cookbook",         // attach under a RegisterModule'd module by id; can be combined with a category inside the module
  order: 0,
}) {}
```

`options` is the `MenuOptions` shape (`@antelopejs/interface-dms/page`): `displayName`, `icon`,
`module` and/or `category` (at least one required; a module page's explicit category must
descend from the module's root), `urlSlug` (defaults to the id), `order`, `description`, `hidden`,
`type`, plus auth knobs (`publicAccess`, `authOnly`, `permission`, `noComponentPermissions` —
see **dms-auth**). `Category(id, options)` returns a `CategoryInfo` to pass as a page's
`category`; `RegisterModule({ id, … })` creates a module root that pages attach to via
`module: "<id>"`. Module pages live under `MODULE_URL_PREFIX` (`/modules`), e.g.
`/modules/<moduleId>/<urlSlug>`, and are **owner-only by design** — a screen for regular
users belongs under `pagesCategory` or a normal `Category`, not under a module.

## Composing components

Each **static field on the page class whose value is a component builder** becomes a named
component. Builders are fluent; import from `@antelopejs/interface-dms/base` (barrel or subpaths):

```ts
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Form } from "@antelopejs/interface-dms/base/form";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";

@RegisterPage()
export class SubmitRecipePage extends PageController("submit-recipe", { displayName: "Submit Recipe", module: "cookbook" }) {
  static form = Form({
    title: "Submit a Recipe",
    fields: [
      { id: "chef",  label: "Chef Name", type: new DefaultDataTypes.StringType({ maxLength: 100 }) },
      { id: "email", label: "Email",     type: new DefaultDataTypes.EmailType() },
    ],
    submitUrl: "/api/recipes",   // a route — often declared on this same class
    submitUrlMethod: HttpMethod.post,
  });
}
```

The full catalog — `Form`, `TableView`, `Tree`, the charts, layout containers, dashboard
widgets, `CustomComponent` — plus nesting rules and the behavioral DSL (permissioned
`.action()`s, `.watch()` reactivity) is in [REFERENCE.md](REFERENCE.md).

**Custom UI: decompose, don't monolith.** Never build a whole screen as one full-page
`CustomComponent` SFC — that silently opts out of per-component permissions,
`.action()`/`.watch()` reactivity, `PeriodSelector` scoping, and backend-driven layout. Use
built-in builders wherever they suffice and one small `CustomComponent` per part that
genuinely needs Vue (`docs/04.components/04.custom-component.md`).

## Feeding components with data

Components pull data from URLs; declare routes with the `@antelopejs/interface-api`
decorators (`Controller`, `Get`, `Post`, `@Parameter`, `@JSONBody`), return a plain object
for 200 or throw `new HTTPResult(status, body)`. `GetModel(Model)` (from
`@antelopejs/interface-database-decorators`) gives `get` / `getAll` / `insert` / `update` /
`delete`. Routes under a controller that a page or DataController wraps **inherit** its auth —
already gated to logged-in callers (see **dms-auth**).

A **`TableView` is normally backed by a `DataController`**: a class
`extends DataController(TableClass, TableViewRoutes.All, Controller("/path"))` registered
with `@RegisterDataController()` (both from `@antelopejs/interface-data-api`).
`TableViewRoutes` (from `@antelopejs/interface-dms/base/table-view`) provides the presets — `Get`, `List`,
`Select`, `Count`, `New`, `Edit`, `Delete`, `Archive`, `Restore`, or `All`. Field decorators:
`@Column` / `@Select` / `@Exported` / `@ArchiveField` / `@Searchable` from `@antelopejs/interface-dms/base` (plus
class-level `@ColumnGroup(id, config)`), `@Listable` / `@Sortable` from
`@antelopejs/interface-data-api/metadata`. Read a
real one first: `@antelopejs/interface-dms/data-controllers` (`members`); guide in
`docs/04.components/09.data-controller.md` (+ `06.tables.md`). Database rows carry **`_id`**
as the primary key — return and type it as `_id`, never alias to `id`.

## DataTypes

A field's `type` is a **DataType instance**: `new DefaultDataTypes.StringType({ … })`; the same
types drive TableView columns and filters. See [REFERENCE.md](REFERENCE.md) for the catalog of
built-in types and how to register custom ones.

## Verify in the browser

The build only typechecks `src/` — it will not catch a Vue error in a custom component or a
wrong URL. After editing pages, full-restart and click through (see **dms-dev**). A hand-written link
to a module page must include the `/modules/<moduleId>` prefix (or read `fullSlug` from the
layout) — a missing prefix 404s through the frontend catch-all even though the build is clean.
