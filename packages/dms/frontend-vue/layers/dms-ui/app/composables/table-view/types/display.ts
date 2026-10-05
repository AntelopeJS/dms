import type { Component } from "vue";
import type { Table } from "@tanstack/vue-table";
import type { TableViewColumn } from "./column";
import type { CustomRowAction } from "../../../types/row-action";

/** The built-in grid display id. */
export const TABLE_DISPLAY_ID = "table";
/** The built-in kanban display id. */
export const KANBAN_DISPLAY_ID = "kanban";
/** The built-in cards display id. */
export const CARDS_DISPLAY_ID = "cards";
/** The built-in grouped display id. */
export const GROUPED_DISPLAY_ID = "grouped";

/**
 * Display ids the DMS keeps for its built-in displays: a module registers its
 * own under `<module>:<id>`.
 */
export const RESERVED_TABLE_VIEW_DISPLAY_IDS = [
  TABLE_DISPLAY_ID,
  KANBAN_DISPLAY_ID,
  CARDS_DISPLAY_ID,
  GROUPED_DISPLAY_ID,
] as const;

/**
 * A row "actor" currently editing an item (realtime presence). Keyed by row id
 * in {@link TableViewPresenceMap}. Part of the public display contract so a
 * custom display can surface "X is editing this" affordances.
 */
export interface TableViewPresenceActor {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  sessionId: string;
  since?: number;
}

export type TableViewPresenceMap = Record<string, TableViewPresenceActor[]>;

/**
 * Selection API exposed to a display. Keys live in the same id space as
 * `rowIdKey` (TanStack `getRowId` reads the same key), so a display and the
 * built-in grid share one selection state.
 */
export interface TableViewDisplaySelection {
  ids: string[];
  isSelected: (id: string) => boolean;
  toggle: (id: string, value?: boolean) => void;
  toggleAll: (value?: boolean) => void;
  clear: () => void;
}

/**
 * Pagination API exposed to a display. For a shared-data display (the common
 * case) these mutate the table view's global pagination, so changing the page
 * re-runs the shared list query.
 */
export interface TableViewDisplayPagination {
  pageIndex: number;
  pageSize: number;
  total: number;
  setPage: (index: number) => void;
  setPageSize: (size: number) => void;
}

/**
 * Resolved row-action capabilities + handlers, identical to what the grid uses.
 * The `canXRow` predicates evaluate per-row rules (e.g. conditional edit/delete)
 * so a display can gate affordances on individual items.
 */
export interface TableViewDisplayActions<T> {
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canDetails: boolean;
  canEditRow: (item: T) => boolean;
  canDeleteRow: (item: T) => boolean;
  add: () => void;
  edit: (item: T) => void;
  delete: (ids: string[]) => void;
  duplicate: (id: string) => void;
  details: (item: T) => void;
  /** What a click on the row does in the grid: its default action. */
  open: (item: T) => void;
  custom: (action: CustomRowAction) => void;
}

/**
 * The card the `kanban` and `cards` displays draw (backend `card` option):
 * the columns it shows, or a component drawing it whole.
 */
export interface TableViewCardConfig {
  fields?: string[];
  component?: ComponentInfo;
}

/**
 * The props a custom card component receives, the same in the `kanban` and
 * `cards` displays.
 */
export interface TableViewCardProps<T = Record<string, unknown>> {
  /** The row the card stands for. */
  row: T;
  /** Its id (its `rowIdKey` value). */
  rowId: string;
  /** Column metadata of the table view (types, labels). */
  columns: TableViewColumn[];
  /** Field naming the row, if configured. */
  labelKey?: string;
  /** The table's row actions and their per-row predicates. */
  actions: TableViewDisplayActions<T>;
  /** The row is selected. */
  selected: boolean;
  /** Selects the row, or unselects it (`false`); toggles without a value. */
  select: (value?: boolean) => void;
  /** Does what a click on the row does in the grid. */
  open: () => void;
  /** Kanban only: the value of the column the card sits in. */
  groupValue?: string;
}

/**
 * The single, normalized prop every display component receives. A display reads
 * what it needs and ignores the rest; everything is sourced from the table
 * view's existing state/handlers so a display inherits search/filters/sorting/
 * pagination for free (when it consumes the shared list query).
 */
export interface TableViewDisplayContext<T = Record<string, unknown>> {
  /** Current page rows from the shared list query. Empty for self-managed displays. */
  items: T[];
  /** Full column metadata (types, labels, accessor keys) — for field rendering. */
  columns: TableViewColumn[];
  loading: boolean;

  selection: TableViewDisplaySelection;
  pagination: TableViewDisplayPagination;
  actions: TableViewDisplayActions<T>;

  presenceByRow: TableViewPresenceMap;
  rowIdKey: string;
  /** Field used as the human label/title of an item, if configured. */
  labelKey?: string;
  /** Data API location (`{location}/list`, `/get`, ...). Needed by self-managed displays. */
  location: string;
  /** Active filters/search/sort query (no limit/offset) — for self-managed fetching. */
  query: Record<string, unknown>;
  /** Stable component/page identifiers, e.g. for per-instance fetch keys. */
  componentId?: string;
  pageId?: string;
  /** Per-instance options declared for this display in the backend config. */
  options?: Record<string, unknown>;
  /** Re-fetch the table view (shared list + tab counts + active display). */
  refresh: () => Promise<void> | void;

  /**
   * Escape hatch: the TanStack table instance, present when the display is
   * rendered inside the table body slot. Advanced displays only.
   */
  table?: Table<T>;
}

/**
 * What chrome the table view shows while a display is active. Column-centric
 * controls (visibility/pin/size/order) are grid-only; transverse controls
 * (filters/search/sorting/tabs) default on. Resolved by
 * `resolveDisplayCapabilities`.
 */
export interface TableViewDisplayCapabilities {
  /** Column visibility/pin/size/order controls. Default false (grid sets true). */
  columnManagement?: boolean;
  /** Filters row + filter trigger. Default true. */
  filters?: boolean;
  /** Global search box. Default true. */
  search?: boolean;
  /** Sort-by-field menu. Default true. */
  sorting?: boolean;
  /** Filter tabs. Default true (kanban: false). */
  tabs?: boolean;
  /**
   * The table's own chrome above the body: caption, actions toolbar, tabs,
   * filters row and bulk-selection bar. Default true; a display that draws a
   * complete interface of its own sets it to false.
   */
  header?: boolean;
}

/** Lightweight context passed to {@link TableViewDisplay.isAvailable}. */
export interface TableViewDisplayAvailabilityContext {
  columns: TableViewColumn[];
  options?: Record<string, unknown>;
}

/**
 * A registered display: a built-in one ("table", "kanban", "cards") or one a
 * module contributes under `<module>:<id>`, registered from a universal plugin
 * via `registerTableViewDisplay`. Holds
 * presentation only; data behaviour (selfManagedData) and chrome (capabilities)
 * live on the backend config (SSR source of truth) — see TableViewDisplayConfig.
 */
export interface TableViewDisplay {
  /**
   * Stable id; matches `displays[].id` / `defaultDisplay` and the persisted
   * preference. A module's display is `<module>:<id>`.
   */
  id: string;
  /** i18n key or literal label shown in the view switcher. */
  label: string;
  /** Icon shown in the view switcher (e.g. "i-ph-cards"). */
  icon: string;
  /**
   * Body renderer. A `ComponentInfo` (name) is resolved via `resolveDmsComponent`;
   * a raw `Component` is used as-is. `undefined` means "render the built-in grid"
   * (used by the `table` display).
   */
  component?: Component | ComponentInfo;
  /** Switcher ordering; lower comes first. Defaults to 100. */
  order?: number;
  /** Hide the display for a given table instance (e.g. kanban needs an eligible column). */
  isAvailable?: (ctx: TableViewDisplayAvailabilityContext) => boolean;
}
