# dms-pages — reference

Deep material for [SKILL.md](SKILL.md): the full component builder catalog and the DataTypes
catalog.

## Component builders

Main builders: `Form`; `TableView(controller, options)`; the charts (`ChartLine`,
`ChartArea`, `ChartBar`, `ChartColumn`, `ChartDonut`, `ChartPie`, `ChartScatter`,
`ChartMixed`, `ChartRadar`, `ChartRadialBar`, `ChartHeatmap`, `ChartCandlestick`, usually
inside `ChartCard`); layout `Grid` + `GridRow`, `HStack` / `VStack` / `Spacer`, `Tab`,
`Guard`, `Placeholder`; dashboard widgets `KpiCard`, `TopListCard`, `PeriodSelector`; display blocks
`StatGroup`, `KeyValueList`, `NavCardGrid`, `EmptyState` (its `code` shows a snippet to
start with), `Banner`, `Card`, and `CodeBlock` (read-only highlighted code with a copy
button: `code` + `language`, or `fetchUrl` answering `{ code, language? }` — see
`docs/04.components/11.display-blocks.md`); and
`CustomComponent` (deep import from `@antelopejs/interface-dms/base/custom` — not in the barrel). Nest with
`.child("key", builder)`; `Grid` children must be `GridRow`s. Builders also carry a
behavioral DSL — permissioned `.action()`s and `.watch()` reactivity — see
`docs/02.building/05.actions-and-reactivity.md`.

`Guard({ fetchUrl, field?, when?, fallback? })` wraps any blocks and shows one `EmptyState`
(`fallback`) in their place when the route says there is nothing: `when: "empty"` (default)
checks the value at `field` (absent / `null` / `false` / `0` / `""` / `[]`), `when: "notFound"`
a 404. The children show while loading and on any other failure; an `emptyState` in the
answer is laid over `fallback` — `docs/04.components/03.layout-and-containers.md#guard`.
A block whose `fetchUrl` answers 404 shows its own "Not found" (no retry), the 404 body's
`message` / `emptyState` over it; a `Guard` with `when: "notFound"` draws the same state once
for the blocks it wraps — `docs/04.components/11.display-blocks.md#not-found`.

A `TableView` scoped by the page URL takes `queryParamFilters: { status: { field: "status" } }`
(hidden filters read from `?status=`; `routeParamFilters` for slug params like `:id`). No
glue is needed around it: an active query filter shows the `filtered` empty state, and a
link changing its value sends the table back to page 1. A drawer or modal row action already
gets `navigation` (J / K, `index` / `total` in the order shown) —
`docs/04.components/06.tables/8.row-drawers.md`.

A button or row action (`customButtons`, `rowActions.custom`, a page's `headerActions`)
points at an `ActionTarget`. A `drawer` target opens from the bottom; give it
`direction: "right"` for a side sheet (an inspector, a detail panel) instead of hosting your
own drawer in a `CustomComponent`.
To read rows one after the other next to the table (a request log), use a `sidePanel`
target instead: a non-modal panel docked on the right whose header the DMS draws (title,
`rowTitle` naming the row from its fields, `positionLabel` "x of y", previous / next, J / K, close), `?record=` kept by default (`deepLink: false` opts out), a "not found" state on a 404 (`notFound: { title, description }`) and the table's
`rowClick: "single"` (a `TableView.fromSource` table reads a deep-linked row beyond its first page through `fetchRowUrl: "/api/x/{id}"`) — never bridge the table's DOM to build one —
`docs/04.components/06.tables/8.row-drawers.md#side-panel`.

A row that must stay on top of a table under any sort (a base language, a default
workspace) takes `pinnedRows: { field: "isBase", equals: true }` — never sort on the
server for it. A row action names its row with `{field}` braces in its `label`
(`"Translate {name}"`), and `rowActions.menuLabel` (`"Actions for {name}"`) names the
row's ⋯ button — `docs/04.components/06.tables/0.index.md#pinned-rows`.

## DataTypes

A field's `type` is a **DataType instance**: `new DefaultDataTypes.StringType({ … })`. The
catalog (19 built in, `@antelopejs/interface-dms/base/data-types`): `String`, `Number`, `Date`,
`Boolean`, `Select`, `Price`, `Percentage`, `Email`, `Color`, `Password`, `Url`, `Phone`,
`Relation`, `CascaderRelation`, `Address`, `RichText`, `StringTime`,
`File`, `Image` (each as `<Name>Type`), plus `StatusType` via the `data-types` barrel. The
same types drive TableView columns and filters — options per type are in
`docs/04.components/08.data-types.md`. Custom types: subclass `DataType`, decorate with
`@RegisterDataType("id")` (frontend side: `docs/05.extending-the-dashboard/04.custom-data-types.md`).
