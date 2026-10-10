# dms-pages — reference

Deep material for [SKILL.md](SKILL.md): the full component builder catalog and the DataTypes
catalog.

## Component builders

Main builders: `Form`; `TableView(controller, options)`; the charts (`ChartLine`,
`ChartArea`, `ChartBar`, `ChartColumn`, `ChartDonut`, `ChartPie`, `ChartScatter`,
`ChartMixed`, `ChartRadar`, `ChartRadialBar`, `ChartHeatmap`, `ChartCandlestick`, usually
inside `ChartCard`); layout `Grid` + `GridRow`, `HStack` / `VStack` / `Spacer`, `Tab`,
`Placeholder`; dashboard widgets `KpiCard`, `TopListCard`, `PeriodSelector`; and
`CustomComponent` (deep import from `@antelopejs/interface-dms/base/custom` — not in the barrel). Nest with
`.child("key", builder)`; `Grid` children must be `GridRow`s. Builders also carry a
behavioral DSL — permissioned `.action()`s and `.watch()` reactivity — see
`docs/02.building/05.actions-and-reactivity.md`.

A button or row action (`customButtons`, `rowActions.custom`, a page's `headerActions`)
points at an `ActionTarget`. A `drawer` target opens from the bottom; give it
`direction: "right"` for a side sheet (an inspector, a detail panel) instead of hosting your
own drawer in a `CustomComponent`.

## DataTypes

A field's `type` is a **DataType instance**: `new DefaultDataTypes.StringType({ … })`. The
catalog (19 built in, `@antelopejs/interface-dms/base/data-types`): `String`, `Number`, `Date`,
`Boolean`, `Select`, `Price`, `Percentage`, `Email`, `Color`, `Password`, `Url`, `Phone`,
`Relation`, `CascaderRelation`, `Address`, `RichText`, `StringTime`,
`File`, `Image` (each as `<Name>Type`), plus `StatusType` via the `data-types` barrel. The
same types drive TableView columns and filters — options per type are in
`docs/04.components/08.data-types.md`. Custom types: subclass `DataType`, decorate with
`@RegisterDataType("id")` (frontend side: `docs/05.extending-the-dashboard/04.custom-data-types.md`).
