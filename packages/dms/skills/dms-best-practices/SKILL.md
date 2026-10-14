---
name: dms-best-practices
description: Non-negotiable rules for building AntelopeJS DMS pages — every page described backend-side as DMS blocks, custom only for the missing block, `.meta()` on every custom block — plus the design-fidelity protocol. Use before creating or changing any DMS page, dashboard or screen, before writing a CustomComponent or Vue for one, and whenever the user provides a design, mockup, Figma frame or screenshot to reproduce.
icon: i-ph-seal-check
category: dashboard
tags: [pages, blocks, custom-component, permissions, design, mockup]
---

# DMS best practices

Three rules hold for every page, and one protocol runs whenever a design is involved. They keep each part of a screen a permission of its own, editable by the page builder, and driven by the theme. **dms-pages** has the APIs; this skill decides what to build.

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

## Design-fidelity protocol

Run it whenever the user hands you a design, mockup or screenshot.

1. **Frame once.** Before building, ask **one** question (`AskUser` when available, else a closed question in chat):
   - *Pixel perfect* — reproduce the design, custom blocks allowed where nothing matches;
   - *DMS equivalents* — map every component to its closest DMS block silently;
   - *Component by component* — **recommended**: decide each visible difference together.
2. **Map** every component of the design to its closest DMS block ([REFERENCE.md](REFERENCE.md) has the mapping table). Differences the theme absorbs — colors, spacing, radius, fonts, shadows — never trigger a question.
3. **Component by component**, for each visible difference (layout, a missing element, another chart kind):
   - **dms-ai** (a `PreviewBlocks` tool exists): call `PreviewBlocks` with the DMS block tree and the user's design as `reference`, then `AskUser` with exactly two options — *Keep the DMS block* / *Build a custom block*.
   - **Anywhere else** (no `PreviewBlocks`): write a three-column table *your design / DMS block / visible difference* — one row per component in the batch — and ask the same closed question.
4. **Build.** Each "custom" answer becomes one custom block under the rules above; everything else stays DMS blocks. Under *pixel perfect*, the rules still hold: only the parts with no matching block become custom.

The step is done when every visibly different component has an answer and every custom block in the page carries `.meta()`.

## Checklist before handing back

- Every page field and child is a DMS block, except custom blocks the user chose or that have no equivalent.
- Every `CustomComponent` has `.meta({ name, description, icon })` with `$` keys present in every locale file.
- Data comes from routes (`fetchUrl`) rather than options computed at registration.
- Verified live with **dms-dev** (the build only typechecks `src/`).
