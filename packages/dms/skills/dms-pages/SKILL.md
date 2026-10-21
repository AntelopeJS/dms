---
name: dms-pages
description: Declares admin pages and composes backend-driven UI on the AntelopeJS DMS. Use when adding a dashboard screen, writing a @RegisterPage / PageController class, composing Form / TableView / Chart / Grid / KpiCard blocks imported from @antelopejs/interface-dms/base, or choosing DataTypes and wiring the routes and DataControllers that feed them.
icon: i-ph-layout
category: dashboard
tags: [pages, components, forms, tables, data-types, navigation]
---

# Pages & components

The DMS is backend-driven: you declare a **page** and attach **components** to it as static
fields. The builders produce a serializable description that the shared Vue 3 + Inertia frontend
renders — you write no Vue for standard screens. **Before composing a page, apply
dms-best-practices** (blocks only, custom for the missing block, `.meta()`, design fidelity). Depth:
`docs/02.building/03.pages-and-components.md` (pages), `docs/02.building/04.navigation.md` (nav
tree), and `docs/04.components/` (one page per block, with its options).

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
`type`, plus auth knobs (`publicAccess`, `authOnly`, `memberAccess`, `permission`, `noComponentPermissions` —
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
    kind: "action",              // sends something new each time; omit for a record form (save bar)
  });
}
```

The full catalog — `Form`, `TableView`, the charts, layout containers, dashboard
widgets, `CustomComponent` — plus nesting rules and the behavioral DSL (permissioned
`.action()`s, `.watch()` reactivity) is in [REFERENCE.md](REFERENCE.md).

**Custom UI: only the missing block.** A screen is always a tree of DMS blocks; a part with no
DMS equivalent becomes one `CustomComponent` (from `@antelopejs/interface-dms/base/custom`) carrying
`.meta({ name, description, icon })` with `$` keys — the rules and the design-fidelity protocol are
in **dms-best-practices** (`docs/04.components/09.custom-component.md`).

## Feeding components with data

Components pull data from URLs; declare routes with the `@antelopejs/interface-api`
decorators (`Controller`, `Get`, `Post`, `@Parameter`, `@JSONBody`), return a plain object
for 200 or throw `new HTTPResult(status, body)`. `GetModel(Model)` (from
`@antelopejs/interface-database-decorators`) gives `get` / `getAll` / `insert` / `update` /
`delete`. Routes under a controller that a page or DataController wraps **inherit** its auth —
already gated to logged-in callers (see **dms-auth**). A route declared on a page class is
served under `/dms/pages`, not at the page's own path (which is the page): name it with
`pageRoutePath(slug, "/route")` from `@antelopejs/interface-dms/page` in a `fetchUrl` /
`submitUrl`. A plain `Controller` the frontend calls sits under `/api/<module>/`.

A **`TableView` is normally backed by a `DataController`**: a class
`extends DataController(TableClass, TableViewRoutes.All, Controller("/path"))` registered
with `@RegisterDataController()` (both from `@antelopejs/interface-data-api`).
`TableViewRoutes` (from `@antelopejs/interface-dms/base/table-view`) provides the presets — `Get`, `List`,
`Select`, `Count`, `New`, `Edit`, `Delete`, `Archive`, `Restore`, or `All`. Field decorators:
`@Column` / `@Select` / `@Exported` / `@ArchiveField` / `@Searchable` from `@antelopejs/interface-dms/base` (plus
class-level `@ColumnGroup(id, config)`), `@Listable` / `@Sortable` from
`@antelopejs/interface-data-api/metadata`. Read a
real one first: `@antelopejs/interface-dms/data-controllers` (`members`); guide in
`docs/04.components/11.data-controller.md` (+ `08.tables/`). Database rows carry **`_id`**
as the primary key — return and type it as `_id`, never alias to `id`.

The table's CSV export writes the `@Exported` fields **for a reader** by default: each
column's translated `name` as its header, a relation's `keyMapping.label`, a select's option
label, a localized date, Yes / No, a percentage with its sign; numbers and prices stay
numeric. Give every exported field a `@Column` with a `$`-key `name`, and set
`exportValues: "raw"` on the `TableView` only when another program reads the file back
(stored values under the field keys). Each cell is worded by its column's DataType
(`exportValue()`, header by `exportHeader()`): a custom type overrides them to export like
its cell. Dates use the user's saved zone, else the browser's (`x-time-zone`, sent by `$authFetch`).

## DataTypes

A field's `type` is a **DataType instance**: `new DefaultDataTypes.StringType({ … })`; the same
types drive TableView columns and filters. See [REFERENCE.md](REFERENCE.md) for the catalog of
built-in types and how to register custom ones.

## Verify in the browser

The build only typechecks `src/` — it will not catch a Vue error in a custom component or a
wrong URL. After editing pages, full-restart and click through (see **dms-project**). A hand-written link
to a module page must include the `/modules/<moduleId>` prefix (or read `fullSlug` from the
layout) — a missing prefix 404s through the frontend catch-all even though the build is clean.
