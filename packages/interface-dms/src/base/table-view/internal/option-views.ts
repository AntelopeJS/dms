/** @internal @packageDocumentation */
import type { Tone } from "../../types/tone";
import type { ButtonPermission } from "../../../component";
import type { ColorValue } from "../../types";
import type { ControllerClass } from "@antelopejs/interface-api";

/** The filter a tab applies on one column. */
export interface TableViewTabFilter {
  /** Filterable column the tab filters on. */
  accessorKey: string;
  /** Value compared; a list of values is joined with commas. */
  value?: string;
  /** Compare mode, e.g. `"is"`. */
  mode: string;
}

/** A sort a view applies: the column, newest or largest first with `desc`. */
export interface TableViewSort {
  field: string;
  desc?: boolean;
}

/** The columns a view shows, and their order. */
export interface TableViewColumnsState {
  /** Columns shown, whatever their default visibility. */
  visible?: string[];
  /** Columns hidden, whatever their default visibility. */
  hidden?: string[];
  /**
   * Column order, left to right; the columns left out follow in their
   * declared order.
   */
  order?: string[];
}

/** The columns of the controller one table view shows: see `TableViewOptions.columns`. */
export interface TableViewColumnsOptions {
  /**
   * Columns this table view opens hidden, as a column declared
   * `isVisible: false` does but for this table view only: another table view
   * over the same controller still shows them. They stay in the column
   * picker, filterable and in the forms.
   */
  hidden?: string[];
}

/** Row height of a table: `compact` gives 36px rows under a 32px header. */
export type TableViewDensity = "default" | "compact";

/**
 * What runs a row's click action (its `isDefault` custom action, else `edit`
 * or `details`): a double-click (`"double"`, the default), or a single click
 * (`"single"`), for a list read row after row in a side panel. A single click
 * on a control of the row (a button, a link, a checkbox) or one ending a text
 * selection runs nothing.
 */
export type TableViewRowClick = "single" | "double";

/**
 * Everything a view sets on the table when it is opened. What a view leaves
 * out falls back to the table's defaults, so opening a view always shows the
 * same rows the same way.
 *
 * A filter value may hold tokens the server resolves for each request, so a
 * view's rows and its counter follow the caller and the clock:
 * `{{user.id}}` (the signed-in user's id), `{{now}}` and `{{now-7d}}` /
 * `{{now+14d}}` (the current instant, moved by whole days).
 */
export interface TableViewViewState {
  /** Filters on filterable columns, shown as the table's filter chips. */
  filters?: TableViewTabFilter[];
  /** Text typed in the search field. */
  search?: string;
  /** Sort of the rows; the list sorts on the first entry. */
  sort?: TableViewSort[];
  /** Columns shown and their order. */
  columns?: TableViewColumnsState;
  /**
   * Display the view opens in (`"table"`, `"kanban"`, `"grouped"`, a
   * module's `<module>:<id>`): it must be one the table offers.
   */
  display?: string;
  /** Row height of the grid. */
  density?: TableViewDensity;
}

/**
 * A named state of the table ("Past due > 7 days", "Mine"). Opening it
 * applies its state; the user may then change filters or sort, which marks
 * the view as modified with a way back (Reset) or forward (Save as new view).
 * A view the module declares is never overwritten.
 */
export interface TableViewView extends TableViewViewState {
  /** Stable id, used in the URL (`?view=<id>`). */
  id: string;
  /** `$`-prefixed: an i18n key. */
  label: string;
  icon?: string;
  /** Colors the view's icon and counter. */
  tone?: Tone;
  /** A status dot drawn before the label. */
  dot?: Tone;
  /**
   * Shows the number of rows the view lists, counted by the controller's
   * `countBatch` route like the tab counters: what opening it would list,
   * under the open tab and the page's URL filters. The open view counts the
   * rows listed, its filters and search as the user edited them.
   */
  count?: boolean;
  /**
   * Gate the view: one of the table's actions by name (e.g. `"export"`), or
   * an `Action` of any component.
   */
  permission?: ButtonPermission;
  /** Absolute permission id the view requires; wins over `permission`. */
  permissionId?: string;
}

/** A view as it reaches the client. */
export type TableViewViewSerialized = Omit<
  TableViewView,
  "permission" | "permissionId"
>;

/**
 * Where the views are drawn: a tab strip above the table (`tabs`), a row of
 * pills above the status tabs (`strip`), or a menu button in the toolbar
 * (`menu`).
 */
export type TableViewViewsLayout = "tabs" | "strip" | "menu";

/** The views a table offers. */
export interface TableViewViewsOptions {
  /** The views the module declares, in order. */
  items: TableViewView[];
  /** Defaults to `tabs`. */
  layout?: TableViewViewsLayout;
  /**
   * View opened on arrival when the URL names none. Without it the table
   * opens in its own default state.
   */
  defaultView?: string;
  /**
   * Lets users save the current state as a view of their own ("Save as new
   * view"), and update or delete it. A user's views are kept with the rest
   * of their table preferences and are never shown to anyone else.
   */
  userViews?: boolean;
}

/** The views of a table as they reach the client. */
export interface TableViewViewsSerialized extends Omit<
  TableViewViewsOptions,
  "items"
> {
  items: TableViewViewSerialized[];
}

/**
 * A tab above the table: it filters the rows on one column (`filter`), or
 * opens another page (`to`) — never both, which registration refuses. A tab
 * with neither, given the id `"all"`, stands in for the implicit "all" tab, at
 * its own position, with its own label and icon.
 */
export interface TableViewTab {
  id: string;
  label: string;
  /** Hidden filter the tab applies, on a single column. */
  filter?: TableViewTabFilter;
  icon?: string;
  textColor?: ColorValue;
  iconColor?: ColorValue;
  /**
   * Turns the tab into a link to another page, typically a sibling list
   * (Members ↔ Invitations): a registered page controller, whose URL and
   * permission the tab follows, or a dashboard path.
   */
  to?: ControllerClass | string;
  /**
   * Gate the tab, a filter tab or a link tab: one of the table's actions by
   * name (e.g. `"list"`), or an `Action` of any component. A link tab to a
   * page controller follows that page's own permission without it.
   */
  permission?: ButtonPermission;
  /** Absolute permission id the tab requires; wins over `permission`. */
  permissionId?: string;
  /**
   * Data controller (or data API location, e.g. `"/api/tables/invites"`)
   * whose row total a link tab shows as its counter.
   */
  countFrom?: ControllerClass | string;
  /**
   * Publishes the tab's counter as the navigation badge of the page it
   * stands for, in the main navigation and the settings one: this table's
   * page for a filter tab, the linked page for a link tab (which then needs a
   * page controller `to` and a data controller `countFrom`). Counted on the
   * server when the menu loads, with the caller's own `list` permission; a
   * count of zero shows no badge. `true` draws it neutral; `{ tone }` draws
   * it in that tone (`{ tone: "warning" }` for a tab of rows to check).
   * The badge counts the tab over the whole page, whatever view, filters,
   * search or URL filters narrow the tab's own counter.
   */
  navBadge?: boolean | TableViewTabNavBadge;
}

/** A tab's navigation badge drawn in a tone (see `TableViewTab.navBadge`). */
export interface TableViewTabNavBadge {
  /** Neutral when absent. */
  tone?: Tone;
}

/** A tab as it reaches the client: link targets resolved to paths. */
export interface TableViewTabSerialized extends Omit<
  TableViewTab,
  "to" | "countFrom" | "permission" | "permissionId"
> {
  /** Path the link tab opens. */
  to?: string;
  /** Full id of the page a link tab opens, when it is a registered page. */
  toPage?: string;
  /** Data API location whose total the link tab shows. */
  countFrom?: string;
}
