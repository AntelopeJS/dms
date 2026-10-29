import { FEATURE_AREAS, type PlaygroundFeature } from "./types";

const AREA = FEATURE_AREAS.tableView;
const ROOT = "/table-view";

export const V2_DESIGN = "0.6.0";
export const SUBLINES = "0.6.2";
export const SOURCE_TOKENS = "0.7.2";
export const CARD_REORDER = "0.7.5";
export const COLUMN_HIDDEN = "0.7.6";
export const SIDE_PANEL = "0.7.8";
export const CARD_ACTIONS = "0.7.9";
export const REQUEST_LOG_GAPS = "0.7.10";
export const PAGE_TOKENS = "0.7.14";
export const VISIBLE_QUERY_FILTERS = "0.7.15";
export const URL_TAB_FOLLOW = "0.7.16";
export const DOWNLOAD_TARGET = "0.7.17";
export const LATEST = "0.7.21";

export const PAGES = {
  drawer: `${ROOT}/table-view-drawer`,
  modal: `${ROOT}/table-view-modal`,
  page: `${ROOT}/table-view-page`,
  customUrls: `${ROOT}/table-view-page-custom-urls`,
  density: `${ROOT}/table-view-density`,
  compact: `${ROOT}/table-view-compact-list`,
  expandable: `${ROOT}/table-view-expandable-rows`,
  cells: `${ROOT}/table-view-cell-displays`,
  views: `${ROOT}/table-view-views`,
  queryFilters: `${ROOT}/table-view-query-filters`,
  sources: `${ROOT}/table-view-sources`,
  requestLog: `${ROOT}/table-view-request-log`,
  tabs: `${ROOT}/table-view-tabs`,
  byStatus: `${ROOT}/table-view-tasks-by-status/pending`,
  formGroups: `${ROOT}/table-view-grouped`,
  actions: `${ROOT}/table-view-custom-row-actions`,
  rules: `${ROOT}/table-view-conditional-delete`,
  archive: `${ROOT}/table-view-archive`,
  kanban: `${ROOT}/table-view-kanban`,
  kanbanCards: `${ROOT}/table-view-kanban-custom-card`,
  reorder: `${ROOT}/table-view-reorder`,
  moduleDisplay: `${ROOT}/table-view-cards-display`,
  relationKey: `${ROOT}/table-view-relation-key`,
  relationMember: `${ROOT}/table-view-relation-dms-member`,
  cascaderCategories: `${ROOT}/table-view-cascader-categories`,
  cascaderProducts: `${ROOT}/table-view-cascader-products`,
  users: `${ROOT}/table-view-users`,
  gateBypass: `${ROOT}/table-view-gate-bypass`,
};

export const BY_STATUS_SLUG = `${ROOT}/table-view-tasks-by-status/:status`;

export function feature(
  name: string,
  api: string,
  demo: string,
  since?: string,
): PlaygroundFeature {
  return { area: AREA, feature: name, api, demo, since };
}
