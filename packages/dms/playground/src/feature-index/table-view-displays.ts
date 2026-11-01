import type { PlaygroundFeature } from "./types";
import {
  feature,
  PAGES,
  V2_DESIGN,
  LATEST,
  CARD_ACTIONS,
  CARD_REORDER,
  SUBLINES,
  SOURCE_TOKENS,
  SIDE_PANEL,
  BY_STATUS_SLUG,
  REQUEST_LOG_GAPS,
} from "./table-view-data";

export const DISPLAYS_AND_CARDS: PlaygroundFeature[] = [
  feature(
    "Kanban board with drag and drop",
    "TableView({ kanban: { groupByField } })",
    PAGES.kanban,
  ),
  feature(
    "Kanban column height",
    'kanban: { columnMaxHeight: "420px" }',
    PAGES.kanban,
  ),
  feature(
    "Read-only board grouped by a boolean",
    "kanban: { groupByField: <boolean column>, draggable: false }",
    PAGES.kanban,
  ),
  feature("Card fields", "TableView({ card: { fields } })", PAGES.kanban),
  feature(
    "Custom card component",
    "card: { component: CustomComponent(...) }",
    PAGES.kanbanCards,
    V2_DESIGN,
  ),
  feature(
    "Built-in cards display",
    'displays: [{ id: "table" }, { id: "cards" }]',
    PAGES.kanbanCards,
    V2_DESIGN,
  ),
  feature(
    "Displays without the grid",
    'displays: [{ id: "cards" }] (no { id: "table" })',
    PAGES.kanbanCards,
    LATEST,
  ),
  feature(
    "Cards running their row's custom actions",
    "card props actions.customFor(row) / actions.custom(action, row)",
    PAGES.kanbanCards,
    CARD_ACTIONS,
  ),
  feature(
    "Module display running row actions",
    "display context actions.customFor / actions.custom",
    PAGES.moduleDisplay,
    CARD_ACTIONS,
  ),
  feature(
    "Module's own table display",
    'displays: [{ id: "table" }, { id: "<module>:<id>", component }] + registerTableViewDisplay',
    PAGES.moduleDisplay,
  ),
  feature(
    "Rows ordered by hand",
    'TableView({ reorder: { field: "position" } })',
    PAGES.reorder,
    V2_DESIGN,
  ),
  feature(
    "Cards ordered by hand",
    "reorder + cards display (card reorder prop)",
    PAGES.reorder,
    CARD_REORDER,
  ),
];

export const CELLS: PlaygroundFeature[] = [
  feature(
    "Identity cell: avatar, badges, You tag",
    "DefaultDisplays.IdentityDisplay({ avatarField, subtitleField, badges, selfField, selfLabel })",
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Empty identity",
    "IdentityDisplay({ emptyLabel, emptyIcon })",
    PAGES.cells,
    SUBLINES,
  ),
  feature(
    "Identity icon read from the row",
    "IdentityDisplay({ iconField, icon })",
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Two-line cell",
    "DefaultDisplays.TwoLineDisplay({ primaryField, subField, emptyLabel })",
    PAGES.cells,
    SUBLINES,
  ),
  feature(
    "Composed and toned sub-lines",
    "ComposedText / CellSubline { text, tone } row fields",
    PAGES.cells,
    SUBLINES,
  ),
  feature(
    "Status pill with a sub-line",
    "DefaultDisplays.StatusPillDisplay({ tones, subField, subTone, liveValues })",
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Status pill toned by the row",
    "StatusPillDisplay({ toneField })",
    PAGES.requestLog,
    SOURCE_TOKENS,
  ),
  feature(
    "On / off indicator",
    "DefaultDisplays.IndicatorDisplay({ onLabel, offLabel, onIcon, offIcon })",
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Relative date with now, soon, past and author",
    "DefaultDisplays.RelativeDateDisplay({ nowWithinMs, soonWithinMs, pastTone, byField })",
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Duration in ms or s, toned by the row",
    'DefaultDisplays.DurationDisplay({ unit: "s", format: "ms", toneField })',
    PAGES.cells,
    SIDE_PANEL,
  ),
  feature(
    "Text toned by the row",
    "DefaultDisplays.TextDisplay({ toneField })",
    PAGES.cells,
    SIDE_PANEL,
  ),
  feature(
    "Pills: related rows, exclusive pill, empty label",
    "DefaultDisplays.PillsDisplay({ labelKey, exclusive, emptyLabel })",
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Pills styled per row",
    "PillsDisplay + PillItem { tone, variant }",
    PAGES.views,
    SOURCE_TOKENS,
  ),
  feature(
    "Progress bar",
    "DefaultDisplays.ProgressDisplay({ doneField, totalField, errorField })",
    PAGES.views,
    V2_DESIGN,
  ),
  feature(
    "Sparkline",
    "DefaultDisplays.SparklineDisplay({ field, tone })",
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Bytes and mono cells",
    "DefaultDisplays.BytesDisplay() / MonoDisplay({ copy })",
    PAGES.views,
    V2_DESIGN,
  ),
  feature(
    "Module's own cell display",
    '@RegisterDisplay("<module>:<id>") + registerDataType',
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Status, tags and color columns",
    "StatusType / TagsType / ColorType columns",
    PAGES.cells,
  ),
  feature("Search with a compare mode", '@Searchable("is")', PAGES.cells),
];

export const SOURCES: PlaygroundFeature[] = [
  feature(
    "Rows read from a module route",
    "TableView.fromSource({ fetchUrl })",
    PAGES.sources,
    V2_DESIGN,
  ),
  feature(
    "Source filtered by the route, searched by the browser",
    "fromSource({ capabilities: { filter: true } })",
    PAGES.sources,
    V2_DESIGN,
  ),
  feature(
    "Source URL naming the page query",
    "fetchUrl: ...?route={{query.route}}",
    PAGES.sources,
    SOURCE_TOKENS,
  ),
  {
    ...feature(
      "Source URL naming a route parameter",
      "fetchUrl: ...?exclude={{params.status}}",
      PAGES.byStatus,
      SOURCE_TOKENS,
    ),
    slug: BY_STATUS_SLUG,
  },
  feature(
    "Source searching, sorting and paging on the server",
    "fromSource({ capabilities: { search, sort, paginate } })",
    PAGES.requestLog,
    V2_DESIGN,
  ),
  feature(
    "Source row read by id for a deep link",
    'fromSource({ fetchRowUrl: ".../{{row.id}}" })',
    `${PAGES.requestLog}?record=req-3`,
    REQUEST_LOG_GAPS,
  ),
  feature(
    "Source rows keyed by another field",
    'fromSource({ rowIdKey: "requestId" })',
    PAGES.requestLog,
  ),
  feature(
    "Source following a period selector",
    "fromSource({ periodScope })",
    PAGES.requestLog,
    SIDE_PANEL,
  ),
  feature(
    "Source route answering held rows",
    "liveHeldAt query parameter",
    PAGES.requestLog,
    SIDE_PANEL,
  ),
  feature(
    "Header button refreshing the page's tables",
    "DefaultLayout({ headerActions }) api target",
    PAGES.sources,
    SOURCE_TOKENS,
  ),
];

export const DATA_AND_TENANCY: PlaygroundFeature[] = [
  feature(
    "Relation column resolving its rows",
    "RelationType({ dataApiController, keyMapping })",
    PAGES.users,
  ),
  feature(
    "Relation on a non-_id key",
    "RelationType({ index }) + @Select()",
    PAGES.relationKey,
  ),
  feature(
    "Relation to the tenant's members",
    "RelationType over memberSettingDataAPI",
    PAGES.relationMember,
  ),
  feature(
    "Cascader picker over a category tree",
    "CascaderRelationType",
    PAGES.cascaderProducts,
  ),
  feature(
    "Self-referencing category tree",
    "CascaderRelationType parent relation",
    PAGES.cascaderCategories,
  ),
  feature(
    "Table readable while the tenant is gated",
    "TableView({ bypassTenantAccessGate: true })",
    PAGES.gateBypass,
  ),
];
