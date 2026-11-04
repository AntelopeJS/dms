import { FEATURE_AREAS, type PlaygroundFeature } from "./types";

const INLINE_EDIT_PAGE = "/table-view/table-view-inline-edit";

function feature(name: string, api: string): PlaygroundFeature {
  return {
    area: FEATURE_AREAS.tableView,
    feature: name,
    api,
    demo: INLINE_EDIT_PAGE,
    since: undefined,
  };
}

/** The TableView inline edit's features, shown on its demo page. */
export const INLINE_EDIT: PlaygroundFeature[] = [
  feature(
    "Cells edited in the grid, each saved at once",
    "TableView({ inlineEdit: true | { columns } })",
  ),
  feature(
    "Editable cells drawn as their inputs",
    'TableView({ inlineEdit: { inputs: "always" } })',
  ),
  feature(
    "Rows opened from their actions only, not by a click",
    'TableView({ rowClick: "none" })',
  ),
];
