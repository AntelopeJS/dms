import { FEATURE_AREAS, type PlaygroundFeature } from "./types";

const AREA = FEATURE_AREAS.tableView;

export const TABLE_VIEW_FEATURES: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "Rows read from a module route",
    api: "TableView.fromSource({ fetchUrl })",
    demo: "/table-view/table-view-sources",
  },
];
