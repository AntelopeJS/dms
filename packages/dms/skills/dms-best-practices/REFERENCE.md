# dms-best-practices — reference

Material for [SKILL.md](SKILL.md): mapping design elements to DMS blocks, the `PreviewBlocks` call with a sketch variant, the safe-mode question, and the text fallback. The block catalog is the source of truth: `ListBlockTypes()` from `@antelopejs/interface-dms/base/block-types`, or `docs/04.components/` (one page per block).

## Design element → DMS block

| In the design | DMS block | Usual visible differences |
| ------------- | --------- | ------------------------- |
| Big number with a trend arrow | `KpiCard` (`variant: "stat"` for the compact look) | Sparkline is a line, not bars |
| Several small figures in a strip | `StatGroup` (`layout: "joined"` or `"cards"`) | One shared card vs separate tiles |
| Chart with a headline value | `ChartCard` + a chart (`ChartArea`, `ChartLine`, `ChartColumn`…) | Legend placement, comparison style |
| Bare chart | `ChartLine` / `ChartArea` / `ChartBar` / `ChartColumn` / `ChartDonut` / `ChartPie` / `ChartRadialBar` / `ChartHeatmap` / `ChartScatter` / `ChartRadar` / `ChartMixed` / `ChartRangeArea` / `ChartCandlestick` | Axis labels, tooltip look |
| Ranked list, leaderboard | `TopListCard` | Bar position, rank badge style |
| Date range picker | `PeriodSelector` (`variant: "segmented"` for pills) | Preset labels |
| Live / pause switch | `LiveToggle` | Pill vs segmented |
| Table, list with actions | `TableView` over a DataController (`displays` for cards / kanban) | Column widths, row height (`density`) |
| Detail facts of a record | `KeyValueList` | Value alignment |
| Recent events, audit log | `ActivityFeed` | Day separators vs relative times |
| Usage bar, quota | `Meter` | Bar thickness (`size`) |
| Notice, alert strip | `Banner` | Wash vs flat background |
| Empty / first-run screen | `EmptyState` (or `Guard` around blocks) | Illustration vs icon well |
| Links to sub-pages as cards | `NavCardGrid` | Card height |
| Code snippet | `CodeBlock` | Theme of the highlighting |
| Panel with a title and actions | `Card` | Head layout |
| Settings card with rows | `Section` + `FieldRow` | Label column width (`layout`) |
| Form, settings form | `Form` / `ResourceForm` | Field layout (`fieldsOrientation`, sections) |
| Tabs | `Tab` (`variant: "pill" \| "link"`) | Tab style |
| Columns / rows of panels | `Grid` + `GridRow`, `HStack` / `VStack` / `Spacer` | Exact gutters |

Nothing matches — a canvas, a map, a bespoke visualization — → a custom block, under the rules of SKILL.md.

## `PreviewBlocks` (dms-ai only)

`PreviewBlocks({ title, description?, tree, reference?, variants? })` — non-blocking; it shows an attachment card in the chat, and a click opens a modal rendering the real blocks next to the reference image, one tab per variant. `tree` is one `PreviewNode` or a list: `{ type, options?, children? }`, children also taking `id`, `slot` and `colSpan`. Use `static*` options (`staticValue`, `staticDataset`, `staticItems`, `items`) so the preview shows data without a route; URL options must be relative paths. `TableView` and `ResourceForm` need a backend class and render as a notice — describe them in the question instead.

A variant holds a `tree` (the DMS block with other options), a `sketch` (static HTML and CSS standing for the custom block you would build), or both, so the user compares it with the DMS option before any Vue exists. Keep a sketch to the element alone: static markup, images as `data:` URLs, and the `--sketch-*` theme variables the tool describes for colors, so it follows light and dark mode.

```ts
PreviewBlocks({
  title: "Revenue tile",
  description: "Your tile as a DMS KPI card, adjusted, and as a custom block",
  tree: { type: "KpiCard", options: { title: "Revenue", valueFormat: "currency", currencyCode: "EUR",
    staticValue: 48200, staticDelta: 12.4, showDelta: true, showSparkline: true,
    staticSparkline: [31, 34, 33, 38, 41, 39, 44, 48] } },
  reference: { attachmentId: "<the user's image attachment>", caption: "Your design" },
  variants: [
    { label: "DMS, compact", tree: { type: "KpiCard", options: { title: "Revenue", variant: "stat", staticValue: 48200 } } },
    { label: "Custom sketch", sketch: {
      html: "<div class='tile'><span>Revenue</span><strong>€48,200</strong><div class='bars'><i style='height:40%'></i><i style='height:70%'></i><i style='height:100%'></i></div></div>",
      css: ".tile{padding:16px;border:1px solid;border-radius:8px}.bars{display:flex;gap:4px;height:32px;align-items:end}.bars i{width:8px;background:currentColor}",
      caption: "Bars under the figure, as in your design" } },
  ],
});
// then
AskUser({ questions: [{
  header: "Revenue tile",
  question: "Keep the DMS KPI card, adjust it, or build a custom block?",
  options: [
    { label: "Keep the DMS block", description: "KpiCard as previewed; themed, permissioned, editable in the builder" },
    { label: "Adjust it through its options", description: "Same block, e.g. the compact variant; tell me what to change" },
    { label: "Build a custom block", description: "A Vue component matching the sketch, declared with .meta(); the rest stays blocks" },
  ],
}] });
```

## Safe mode: a custom block is out of reach

The Builder tools cannot write Vue. Show the closest composition with `PreviewBlocks`, then:

```ts
AskUser({ questions: [{
  header: "Seat map",
  question: "Safe mode cannot build a custom block. Use the closest DMS composition, or switch to Code mode for this block only?",
  options: [
    { label: "Use the DMS composition", description: "A Grid of KpiCard per zone, as previewed" },
    { label: "Switch to Code mode for this block", description: "Only the seat map becomes custom, with .meta(); then back to safe mode" },
  ],
}] });
```

## Text fallback (no `PreviewBlocks`)

One table per batch of components, then one closed question per row:

| Your design | DMS block | Visible difference |
| ----------- | --------- | ------------------ |
| Revenue tile with bars under the figure | `KpiCard` with a sparkline | A line instead of bars |
| Orders table with avatars in the first column | `TableView` with `IdentityDisplay` | None beyond spacing — no question |

> Revenue tile: keep the DMS block, adjust it through its options, or build a custom block?

When the custom option is hard to picture, add its sketch as a short markup snippet under the table (a few lines of HTML, no styling detail). Leave rows whose only difference is theme-level (colors, spacing, fonts) out of the questions.
