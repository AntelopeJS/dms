# dms-pages — reference

Deep material for [SKILL.md](SKILL.md): the block catalog, patterns by topic, and the DataTypes
catalog.

## Block catalog

Every block is a registered type (`ListBlockTypes()` from `@antelopejs/interface-dms/base/block-types`
lists them with their option schemas); `docs/04.components/` has one page per block.

| Group | Blocks |
| --- | --- |
| Layout | `Grid` + `GridRow` (children must be rows; `{ colSpan }` child metadata), `HStack` / `VStack` / `Spacer`, `PageToolbar` (`pageToolbar()`), `Card` (slots `actions`, `footer`), `Tab` (`{ slot }` per child), `Guard`, `Placeholder` |
| Charts & widgets | `KpiCard`, `ChartCard` (wraps one chart), `TopListCard`, `PeriodSelector`, `LiveToggle`; charts `ChartLine`, `ChartArea`, `ChartRangeArea`, `ChartBar`, `ChartColumn`, `ChartScatter`, `ChartMixed`, `ChartRadar`, `ChartCandlestick`, `ChartDonut`, `ChartPie`, `ChartRadialBar`, `ChartHeatmap` |
| Display | `StatGroup`, `KeyValueList`, `NavCardGrid`, `EmptyState` (its `code` shows a snippet), `Banner`, `CodeBlock` (`code` + `language`, or `fetchUrl` answering `{ code, language? }`) |
| Lists & settings | `ActivityFeed`, `Meter`, `Section` + `FieldRow` |
| Data | `Form`, `ResourceForm(controller, { mode: "new" \| "edit" \| "view" })` (from `/base/table-view`), `TableView(controller, options)` |
| Escape hatch | `CustomComponent(name)` (deep import from `@antelopejs/interface-dms/base/custom` — not in the barrel), always with `.meta()` — see **dms-best-practices** |

Nest with `.child("key", builder)`. Builders also carry a behavioral DSL — permissioned
`.action()`s and `.watch()` reactivity — see `docs/02.building/05.actions-and-reactivity.md`.

`Guard({ fetchUrl, field?, when?, fallback? })` wraps any blocks and shows one `EmptyState`
(`fallback`) in their place when the route says there is nothing: `when: "empty"` (default)
checks the value at `field` (absent / `null` / `false` / `0` / `""` / `[]`), `when: "notFound"`
a 404. The children show while loading and on any other failure; an `emptyState` in the
answer is laid over `fallback` — `docs/04.components/03.layout-and-containers/5.guard.md`.
A block whose `fetchUrl` answers 404 shows its own "Not found" (no retry), the 404 body's
`message` / `emptyState` over it — `docs/04.components/02.block-fundamentals.md#not-found`.

A `TableView` scoped by the page URL takes `queryParamFilters: { status: { field: "status" } }`
(hidden filters read from `?status=`; `routeParamFilters` for slug params like `:id`). No
glue is needed around it: an active query filter shows the `filtered` empty state, and a
link changing its value sends the table back to page 1. A drawer or modal row action already
gets `navigation` (J / K, `index` / `total` in the order shown) —
`docs/04.components/08.tables/8.row-drawers.md`.

A page's `headerActions` follow its URL: a target URL takes `{{params.X}}` / `{{query.X}}`
(`?workspace={{query.workspace}}`, a pair the page has no value for is dropped), a label's
translation takes the page's route and query parameters (`"Download {locale}.json"`), and an
`availability` reads `context.query`, asked again when the query changes — no need to build
the header in Vue with `usePageHeaderActions` to carry the scope —
`packages/interface-dms/docs/3.base/6.layout.md#buttons-that-follow-the-page-url`. An `availability`
answering `{ hidden: true }` leaves the button out for that query (`{ reason }` only
disables it): no Vue header to hide "Add key" on a read-only workspace. `order` on a
header button and `usePageHeaderActions(render, { order })` interleave served buttons with a
component's client-side ones (default `0`, served first on a tie: `order: -1` puts a Vue
"Export" before a served "Add key") — `packages/interface-dms/docs/3.base/6.layout.md#ordering-the-header`.

A button or row action (`customButtons`, `rowActions.custom`, a page's `headerActions`)
points at an `ActionTarget`. A `drawer` target opens from the bottom; give it
`direction: "right"` for a side sheet (an inspector, a detail panel) instead of hosting your
own drawer in a `CustomComponent`.
To read rows one after the other next to the table (a request log), use a `sidePanel`
target instead: a non-modal panel docked on the right whose header the DMS draws (title,
`rowTitle` naming the row from its fields, `positionLabel` "x of y", previous / next, J / K, close), `?record=` kept by default (`deepLink: false` opts out), a "not found" state on a 404 (`notFound: { title, description }`) and the table's
`rowClick: "single"` (a `TableView.fromSource` table reads a deep-linked row beyond its first page through `fetchRowUrl: "/api/x/{{row.id}}"`) — never bridge the table's DOM to build one —
`docs/04.components/08.tables/8.row-drawers.md#side-panel`.
A drawer, modal or side panel component reading its row by id names it `{{query.record}}`
(`ResourceForm(controller, { mode: "view", rowId: "{{query.record}}" })`, a block's
`fetchUrl`): the DMS fills it with the id of each row it opens, J / K included.
A button downloading a file the user's session may read (`/api/...`) takes a `download`
target, `{ url, filename? }`, with the same `{{row.field}}` / `{{query.X}}` tokens — never a Vue
header button or an `api` target for it — `packages/interface-dms/docs/3.base/2.types.md`.

A row that must stay on top of a table under any sort (a base language, a default
workspace) takes `pinnedRows: { field: "isBase", equals: true }` — never sort on the
server for it. A row action names its row with `{field}` braces in its `label`
(`"Translate {name}"`), and `rowActions.menuLabel` (`"Actions for {name}"`) names the
row's ⋯ button — `docs/04.components/08.tables/0.index.md#pinned-rows`.

## Patterns by topic

### Data, URLs and refresh

- Every URL token is `{{<scope>.<key>}}`: `params` and `query` (the page URL, percent-encoded;
  nothing is fetched while one is unresolved), `row` (an action's row), `response` (a form's
  redirect). The same page tokens work in every URL and link option.
- `.watch(FormEvents.SUBMIT_SUCCESS, BlockFunctions.REFRESH_PAGE)` makes the page's data blocks
  (table views included) re-fetch after a form saves.
- `periodScope` binds a card, chart, list block, `Meter` or `TableView.fromSource` to a
  `PeriodSelector`, which keeps its period in the page URL (`?<id>.period=`). Its selected
  comparison drives the cards: `KpiCard` names it ("vs previous year", leave `compareLabel`
  unset) and prints the route's `previousValue`; "No comparison" hides the change, the value
  compared against and the label on `KpiCard`, `ChartCard` and `TopListCard`.
- `realtimeTopic` re-fetches a chart, a `KpiCard`, list block, `Meter`, `Tab` badges or `TableView` on each
  `PublishMessage`.

### Live pages

- A monitoring page that must not refetch on every event declares `live: { maxRate }` in its page
  options (`slowRateAfter: { period: "7d", maxRate: 60 }` for long periods, `rememberKey: "<module>"`
  to share the choice; `maxRate` is also the polling interval while the stream is down) and places a
  `LiveToggle()` (Live / Pause, L key; `variant: "pill"`, `missedLabel` for "N new requests").
- A page with a period or live data starts with `pageToolbar({ leading, live, period })`
  (`base/page-toolbar`): the same bar on every page — leading blocks, then "Updated N s ago",
  Live / Pause, the window and the 1H / 24H / 7D / 30D presets, at one `size` and one height
  (24 / 28 / 32 px, with live or not). `live: false` or `period: false` drops a control; without
  `live` it shows the last read and a refresh button. A module's leading chip takes the toolbar's
  height from `usePageToolbarSize().heightClass`. More than one comparison offered
  (`comparisons: ["previous-period", "previous-year", "none"]`) draws a "vs … ▾" menu; a single one
  stays on without a control. A `custom` preset shows as a calendar icon, named in full.
- `liveHold: true` keeps a table's rows while paused, and in Direct while they are on screen (new
  rows wait behind a "N new · Show" pill over the rows); `liveHold: { whileRowOpen, whileScrolled,
  whileSearching, whileSorted }` also holds the table alone; `liveHold.missedLabel` words its "N new".
  Paused, an event counts as its `payload.ids` rows or its `payload.count`, so a module may batch
  publishes with `{ count }`. A hidden tab and `?live=0` pause the page too.
- A custom component follows that state with `usePageLive()` (`hold(reason)` / `release()`,
  `setMissedDetail()`); one that reads its own data on a topic calls
  `usePageLiveRefresh(refresh, { realtimeTopic, idleRefresh })` — never a throttle of its own.
  `refreshPageBlocks()` (user actions) always reads; `refreshLivePageBlocks()` (timers, feeds) is
  held while paused. A table view's write (row/bulk action, its form saved) already
  calls `refreshPageBlocks()`: KPIs and badges of the page need no wiring of their own.
- Making a block live: a built-in data block names a `realtimeTopic` (its builder registers the
  topic on the page) and the backend calls `PublishMessage`; a table view follows its controller's
  row events by itself. A block without a topic reads only on `refreshLivePageBlocks()`, the
  polling while the stream is down and `refreshPageBlocks()` — no timer while the stream is up. A
  custom component's own topic needs `RegisterPageTopic(pageId, topic)` in the backend.
- Pause (user, hold, hidden tab) freezes every block of the page at once: realtime events, row
  events, page-topic events behind `useApiData`, `refreshLivePageBlocks()`, `idleRefresh`, the
  stream-down polling and a component's `useApiData` `refreshInterval`. Each block that missed
  something reads once on resume. User actions and inputs (period, filter, search, sort, page)
  still read; notifications, presence and the menu are not the page and keep updating.

### Texts

- A text naming values is a `ComposedText` — `{ key, params: { amount: { type: "money", value: 92200,
  currency: "EUR" } } }` — written by the browser in the reader's language. StatGroup /
  KeyValueList / Banner / NavCardGrid / ActivityFeed / Meter / TopListCard item texts, ActivityFeed
  `params` (typed `count` for plurals), tab badges and layout banners (`RegisterLayoutBanner({ resolve })`
  → `{ text, actions }`) take it. Never format text server-side.
- A route that must word a text reads the request's `x-content-language` header (the language on
  screen), never `users.language` (the profile's, for mails).
- A status the backend computes (health, outage) is a `Banner({ fetchUrl })`: the route answers a
  `BannerContent` (its buttons may run `api` / modal / quick-action targets with `confirm`) or
  `null` for no banner.

### Blocks

- `StatGroup` details and `NavCardGrid` card titles take up to two lines before their ellipsis.
- `ActivityFeed`: `wrap: true` for entries read whole (leave `fillHeight` off), `visibleItems: N`
  for a "Show N more" fold.
- `KeyValueList` rows take `copy: true` or `copyValue` (the text to copy instead).
- `TopListCard({ actions })` puts link buttons in its head; `Tab({ fit: true })` keeps pill tabs to
  their labels' width; with `persistState` the URL names the open tab by its slot (`?tab=tester`).
- A `ChartCard` plotting several series names them with `showSeriesLegend: true` (placed by the
  chart's `legendPosition`) — never a raw Apex `legend` in `rawOptions`.
- A chart route sends series names, categories (`x`) and point labels as `$` keys, bare chart or
  `ChartCard` alike: the browser translates them, so donut slices are `{ x: "$app.plan.pro", y }`.

### Tables

- A cell's secondary line is a row field holding text or a composed text (or `{ text, tone }`),
  named by `StatusPillDisplay({ subField })`, `IdentityDisplay({ subtitleField })` or
  `TwoLineDisplay({ subField })`; `IdentityDisplay({ emptyLabel, emptyIcon, iconField })`.
- `StatusPillDisplay({ toneField })`, `DurationDisplay({ toneField, format: "ms" })` and
  `TextDisplay({ toneField })` read a tone from a row field; a `PillsDisplay` item may be
  `{ label, tone?, variant: "soft" | "outline" }`.
- A `TableView` over a shared controller hides a column on one page with
  `columns: { hidden: ["workspace"] }` — no view just to hide it.
- A table of more than a few columns that phones will read offers the cards and opens them there:
  `displays: [{ id: "table" }, { id: "cards" }], mobileDisplay: "cards"`. Only a display the user
  saved or the open view's own `display` overrides it: a `views.defaultView` that sets no display
  still opens phones on the cards.
- A table ordered by hand (`reorder: { field }`) moves rows on the grid and cards on the `cards`
  display alike; a `card.component` receives a `reorder` prop and `v-bind`s `reorder.handle`.
- A `cards` display whose cards need more room sets `card.minWidth` (a CSS length, `230px` by
  default, the skeleton follows): cards stretch to fill the row, a short list's up to twice that.
- A `cards` display whose `card.component` is taller than the built-in card sets
  `card.skeletonHeight` to its height (a CSS length): the loading placeholder takes it, so the
  pagination footer does not drop when the cards land.

### Forms

- A unit after a number field is `NumberType({ suffix: "$…days" })`; a character counter is
  `StringType({ maxLength, showCount: true })` — no custom `inputComponent` for either.
- A long sectioned `Form` groups its navigation with `FormSection.navGroup`, in the side list and
  the `sectionNav: "jump"` chips alike.
- A module's own `inputComponent` submits its form, adds a validator and focuses a field with
  `useEnclosingForm()` (never `closest("form")` / `requestSubmit()`); a link ending in `#<fieldId>`
  opens the form on that field. `DmsInputNumber` emits `adjust` when it keeps another value than the
  one typed — listen to it rather than forcing a remount.

### Custom components

- Name the record at the end of the breadcrumb with
  `usePageRecordLabel().setLabel(useDmsRoute().path, label)`.
- Format through `useRegionalFormat()`; `useRegionalFormat({ locale: "format" })` writes in the
  locale of the DMS's texts (`en` → `en-GB`).
- Bring a block into view with `scrollToBlock("tabs.statistics")` — never a DOM query.
- Show code with `DmsCodeSnippet` (`language`, `title`, `maxLines` or `maxHeight`, `wrap`) — never a
  `<pre>` and a copy button of your own.

## DataTypes

A field's `type` is a **DataType instance**: `new DefaultDataTypes.StringType({ … })`. The
catalog (19 built in, `@antelopejs/interface-dms/base/data-types`): `String`, `Number`, `Date`,
`Boolean`, `Select`, `Price`, `Percentage`, `Email`, `Color`, `Password`, `Url`, `Phone`,
`Relation`, `CascaderRelation`, `Address`, `RichText`, `StringTime`,
`File`, `Image` (each as `<Name>Type`), plus `StatusType` via the `data-types` barrel. The
same types drive TableView columns and filters — options per type are in
`docs/04.components/10.data-types.md`. Custom types: subclass `DataType`, decorate with
`@RegisterDataType("id")` (frontend side: `docs/05.extending-the-dashboard/04.custom-data-types.md`).
