import type { ComponentInfo } from "../component";
import type { QuickActionInfo } from "../quick-actions";

/** Colors a page header action button takes. */
export type PageHeaderActionColor =
  | "primary"
  | "secondary"
  | "neutral"
  | "success"
  | "warning"
  | "error"
  | "info";

/** Fill styles a page header action button takes. */
export type PageHeaderActionVariant =
  | "solid"
  | "outline"
  | "soft"
  | "subtle"
  | "ghost";

/**
 * A button in the page header, right of the title: a primary "New invoice",
 * an "Export", a link to the docs.
 *
 * It opens `to`, runs a registered quick action, or presses a component's
 * custom `button`. A quick action lends
 * its label and icon and, being served only to the users its page admits, its
 * access too; `permission` restricts any action further.
 */
export interface PageHeaderAction {
  /** Key of the action, unique in the header. */
  id: string;
  /** Button text (i18n key with `$` or literal). */
  label?: string;
  /** Icon name, e.g. `i-ph-plus`. */
  icon?: string;
  /** DMS path the button opens, or a full URL with `external`. */
  to?: string;
  /** Opens `to` in a new tab. */
  external?: boolean;
  /**
   * Quick action the button runs: what `QuickAction()` returned, or its key —
   * `category:id`, or the bare id when no other category uses it. The button
   * is left out for users the quick action is not served to.
   */
  quickAction?: string | QuickActionInfo;
  /**
   * Presses the custom button of this `id` a component of the page declares
   * (a table view's `customButtons[].id`, often one marked `hidden`). The
   * header button mirrors it: left out when the button is not served to the
   * user, disabled with its reason when its availability refuses.
   */
  button?: string;
  /** Defaults to `neutral` (outline); give the page's main action `primary`. */
  color?: PageHeaderActionColor;
  variant?: PageHeaderActionVariant;
  /**
   * Permission id the user must hold to see the button (checked when the
   * layout is served).
   */
  permission?: string;
}

/** A header action as the layout serves it: the quick action by key. */
export type PageHeaderActionSerialized = Omit<
  PageHeaderAction,
  "quickAction"
> & { quickAction?: string };

export interface DefaultLayoutOptions {
  /**
   * Content spans the whole panel. Defaults to `true`: dashboard pages are
   * full-width unless they opt out. Set to `false` for pages that only hold a
   * form, where a constrained column stays readable.
   */
  fullWidth?: boolean;
  hideHeader?: boolean;
  /**
   * The page fills the height of the dashboard panel instead of growing with
   * its content, for a page built around one tool that scrolls inside itself:
   * a file explorer, a data grid, a canvas. The page header keeps its height
   * and the last component of the page takes the rest: give its root
   * `flex-1 min-h-0` and let an element inside it scroll. The page stops
   * shrinking at a minimum height, below which the panel scrolls again.
   * Defaults to `false`.
   */
  fillHeight?: boolean;
  /** Buttons right of the page title, in order. */
  headerActions?: PageHeaderAction[];
}

function serializeHeaderAction(
  action: PageHeaderAction,
): PageHeaderActionSerialized {
  const { quickAction, ...rest } = action;
  if (quickAction === undefined) return rest;
  return {
    ...rest,
    quickAction:
      typeof quickAction === "string"
        ? quickAction
        : `${quickAction.category.id}:${quickAction.id}`,
  };
}

export function DefaultLayout(options?: DefaultLayoutOptions): ComponentInfo {
  const { headerActions, ...rest } = options ?? {};
  const layoutOptions: Omit<DefaultLayoutOptions, "headerActions"> & {
    headerActions?: PageHeaderActionSerialized[];
  } = { fullWidth: true, ...rest };
  if (headerActions) {
    layoutOptions.headerActions = headerActions.map(serializeHeaderAction);
  }
  return {
    componentName: "dms-default-layout",
    options: layoutOptions,
  };
}

/**
 * Standard dashboard frame for a page that holds nothing but a form: keeps the
 * constrained, readable content column instead of the full-width default.
 */
export function FormPageLayout(
  options?: Omit<DefaultLayoutOptions, "fullWidth">,
): ComponentInfo {
  return DefaultLayout({ ...options, fullWidth: false });
}

export function EmptyLayout(): ComponentInfo {
  return {
    componentName: "dms-empty-layout",
    options: {},
  };
}
