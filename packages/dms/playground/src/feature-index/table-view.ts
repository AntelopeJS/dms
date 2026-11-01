import type { PlaygroundFeature } from "./types";
import {
  FORMS_AND_CONTAINERS,
  LAYOUT_AND_PAGING,
  FILTERS_TABS_VIEWS,
  EMPTY_STATES_AND_REALTIME,
} from "./table-view-layout";
import { ROW_ACTIONS } from "./table-view-actions";
import {
  DISPLAYS_AND_CARDS,
  CELLS,
  SOURCES,
  DATA_AND_TENANCY,
} from "./table-view-displays";

export const TABLE_VIEW_FEATURES: PlaygroundFeature[] = [
  ...FORMS_AND_CONTAINERS,
  ...LAYOUT_AND_PAGING,
  ...FILTERS_TABS_VIEWS,
  ...EMPTY_STATES_AND_REALTIME,
  ...ROW_ACTIONS,
  ...DISPLAYS_AND_CARDS,
  ...CELLS,
  ...SOURCES,
  ...DATA_AND_TENANCY,
];
