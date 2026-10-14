# dms-best-practices — reference

Material for [SKILL.md](SKILL.md): mapping design elements to DMS blocks, the `PreviewBlocks` call, and the text fallback. The block catalog is the source of truth: `ListBlockTypes()` from `@antelopejs/interface-dms/base/block-types`, or `docs/04.components/` (one page per block).

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

`PreviewBlocks({ title, description?, tree, reference?, variants? })` — non-blocking; it shows an attachment card in the chat, and a click opens a modal rendering the real blocks next to the reference image. `tree` is one `PreviewNode` or a list: `{ type, options?, children? }`, children also taking `id`, `slot` and `colSpan`. Use `static*` options (`staticValue`, `staticDataset`, `staticItems`, `items`) so the preview shows data without a route; URL options must be relative paths. `TableView` and `ResourceForm` need a backend class and render as a notice — describe them in the question instead.

```ts
PreviewBlocks({
  title: "Revenue tile",
  description: "Your tile as a DMS KPI card",
  tree: { type: "KpiCard", options: { title: "Revenue", valueFormat: "currency", currencyCode: "EUR",
    staticValue: 48200, staticDelta: 12.4, showDelta: true, showSparkline: true,
    staticSparkline: [31, 34, 33, 38, 41, 39, 44, 48] } },
  reference: { attachmentId: "<the user's image attachment>", caption: "Your design" },
  variants: [{ label: "Compact", tree: { type: "KpiCard", options: { title: "Revenue", variant: "stat", staticValue: 48200 } } }],
});
// then
AskUser({ questions: [{
  header: "Revenue tile",
  question: "Keep the DMS KPI card, or build a custom block?",
  options: [
    { label: "Keep the DMS block", description: "KpiCard as previewed; themed, permissioned, editable in the builder" },
    { label: "Build a custom block", description: "A Vue component matching the design, declared with .meta()" },
  ],
}] });
```

## Text fallback (no `PreviewBlocks`)

One table per batch of components, then one closed question per row:

| Your design | DMS block | Visible difference |
| ----------- | --------- | ------------------ |
| Revenue tile with bars under the figure | `KpiCard` with a sparkline | A line instead of bars |
| Orders table with avatars in the first column | `TableView` with `IdentityDisplay` | None beyond spacing — no question |

> Revenue tile: keep the DMS block, or build a custom block?

Leave rows whose only difference is theme-level (colors, spacing, fonts) out of the questions.
