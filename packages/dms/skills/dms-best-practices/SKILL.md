---
name: dms-best-practices
description: Enforces the rules for building AntelopeJS DMS pages — every page described backend-side as DMS blocks, custom code only for the missing block, `.meta()` on every custom block — decides when to leave DMS blocks and proposes that deviation to the user, and runs the design-fidelity protocol. Use when creating or changing any DMS page, dashboard or screen, before writing a CustomComponent or Vue for one, or when the user provides a design, mockup, Figma frame or screenshot to reproduce.
icon: i-ph-seal-check
category: dashboard
tags: [pages, blocks, custom-component, permissions, design, mockup]
---

# DMS best practices

Three rules hold for every page, a path runs before any custom block, and a protocol runs whenever a design is involved. They keep each part of a screen a permission of its own, editable by the page builder, and driven by the theme. **dms-pages** has the APIs; this skill decides what to build.

## The rules

1. **A page is always blocks.** Describe every page on the backend as a tree of DMS blocks — `PeriodSelector`, `Grid` / `GridRow`, `KpiCard`, `TableView`, `Form`, … Each static field and each `.child()` is a line in the roles editor, a `.watch()` target, a `periodScope` subscriber and a node the builder can move. One block that draws the whole screen loses all of that.
2. **Custom = the missing block only.** When a part has no DMS equivalent, build **that block** as a `CustomComponent` and keep everything around it — toolbar, filters, stats, tables — as DMS blocks on the backend.
3. **Every custom block carries `.meta()`.** `.meta({ name, description, icon })` in its backend declaration, `name` and `description` as `$` i18n keys added to every locale file. Without it the roles editor shows the raw component name. Every other text (page names, titles, labels) is a `$` key too.

```ts
// Good — blocks around the one custom block, which carries its metadata
static period = PeriodSelector({ id: "api" });
static kpis = Grid().child("row", GridRow()
  .child("calls", KpiCard({ title: "$api.routes.calls", fetchUrl: "/api/routes/calls", periodScope: "api" })));
static graph = CustomComponent("ApiRouteGraph")
  .options({ fetchUrl: "/api/routes/graph", periodScope: "api" })
  .meta({ name: "$api.routes.graph.name", description: "$api.routes.graph.description", icon: "i-ph-graph" });

// Bad — one component draws the period picker, the KPIs and the graph; no .meta()
static screen = CustomComponent("ApiRoutesScreen");
```

`CustomComponent` comes from `@antelopejs/interface-dms/base/custom` (not the `base` barrel); `.meta()` takes `Partial<ComponentMetadata>` (`name`, `description?`, `icon?`). Every DMS factory sets its own metadata; a custom block is the one place you must.

## When to leave DMS blocks

A custom block is a deviation, and you **propose** it: the user decides, after the path below. It is worth proposing only when one of these holds:

| Leave DMS blocks when | Stay on DMS blocks when |
| --------------------- | ----------------------- |
| No block covers the need, even through its options or a composition of blocks | The difference is spacing, color, radius, font or a minor layout the theme or the block's options handle |
| The interaction model differs: a drag-and-drop canvas, real-time collaborative editing | The DMS block only "looks slightly different" from the mockup |
| The user asked for pixel perfect on **this** element | Another element of the page is custom: a custom block never pulls its neighbours along |
| A measured constraint (performance, data volume) the block cannot meet | The constraint is a guess, not a measurement |

## Before any custom block

Run this path before writing a `CustomComponent` or its Vue, one element at a time:

1. **Search the catalog.** In dms-ai with the Builder loaded, `BuilderCatalog`; otherwise the block catalog of the DMS (`GET /api/block-preview/types` on a running instance, or `docs-data/blocks.json` of AntelopeJS/dms); otherwise the exports of `@antelopejs/interface-dms/base`. Try the block's options first, then a composition of blocks (`Card` + `KeyValueList`, `ChartCard` + a chart, `Grid` of `KpiCard`).
2. **Show the comparison.** In dms-ai, call `PreviewBlocks` with the closest DMS option as `tree`, the user's mockup as `reference`, and a **sketch variant** of the custom block (`label` naming the DMS tab, and `variants: [{ label, tree }, { label, sketch: { html, css?, caption?, height? } }]`). Elsewhere, write the text table of [REFERENCE.md](REFERENCE.md).
3. **Ask.** One closed question (`AskUser` in dms-ai) with three options: *Keep the DMS block* / *Adjust it through its options* / *Build a custom block*.
4. **Build.** On *Adjust*, change the block's options and preview again. Only on *Build a custom block*, build that block alone, under the rules above, with `.meta()`; the rest of the page stays blocks.

In **safe mode** (dms-ai, Builder tools only), step 4 is impossible: say so, offer the closest DMS composition, and ask with `AskUser` whether to switch to Code mode for that one block.

The path is done when the user has answered for the element. [REFERENCE.md](REFERENCE.md) has worked calls and the fallback table.

## Design-fidelity protocol

Run it whenever the user hands you a design, mockup or screenshot.

1. **Frame once.** Before building, ask **one** question (`AskUser` when available, else a closed question in chat):
   - *Pixel perfect* — reproduce the design, custom blocks allowed where nothing matches;
   - *DMS equivalents* — map every component to its closest DMS block silently; an element no block or composition covers still goes through the path;
   - *Component by component* — **recommended**: decide each visible difference together.
2. **Map** every component of the design to its closest DMS block ([REFERENCE.md](REFERENCE.md) has the mapping table). Differences the right-hand column of the grid lists never trigger a question.
3. **Decide.** *Component by component*: run [the path](#before-any-custom-block) for each visible difference (layout, a missing element, another chart kind), batching several components in one preview and one question. *Pixel perfect* answers step 3 of the path for every element, so skip that question but still run step 1: only the parts no block or composition matches become custom.
4. **Build** under the rules above.

The protocol is done when every visibly different component has an answer and every custom block in the page carries `.meta()`.

## Checklist before handing back

- Every page field and child is a DMS block, except custom blocks the user chose through the path.
- Every `CustomComponent` has `.meta({ name, description, icon })` with `$` keys present in every locale file.
- Every automation node a module registers names itself, its description and each schema property's `title` and `description` with `$` keys present in every locale file (`docs/02.building/06.backend-services.md`, Texts in the builder).
- Locale values escape vue-i18n's special characters as literals (`{'@'}`, `{'{'}`, `{'}'}`, `{'|'}`): a raw `@` or brace breaks the message's compilation (`docs/02.building/07.localization.md`, Special characters).
- Data comes from routes (`fetchUrl`) rather than options computed at registration; a custom block reads its route with `useApiData` (server-rendered, refreshed with the page) and writes with `$authFetch`.
- Publish tenant data with the tenant id: a `PublishMessage` about one workspace's data passes `{ tenantId }`, or it wakes the page of every workspace.
- Verified live with **dms-project** (the build only typechecks `src/`).
