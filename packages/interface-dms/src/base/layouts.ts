import type { ComponentInfo } from "../component";
import { serializeActionConfirm } from "./internal/confirm-dialog";
import { serializeActionTarget } from "./types/internal/action-target";
import type { PageHeaderSource } from "./page-header";
import type { RecordAction } from "./types/record-action";
import type {
  DefaultLayoutSerializedOptions,
  PageHeaderButtonDeclared,
} from "./internal/layouts";

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
  /**
   * Drives the page header from a record, for a detail page: the route of
   * `fetchUrl` answers its title, avatar, status, badges and meta line, and
   * the record the `when` / `unavailableWhen` conditions of `headerActions`
   * read. The header shows placeholders until it lands and keeps the page's
   * own title if the route fails; read again after each header action.
   *
   * @example
   * ```typescript
   * DefaultLayout({
   *   header: { fetchUrl: "/api/workspaces/{{params.id}}/header" },
   *   headerActions: [
   *     {
   *       label: "$saas.wd.suspend",
   *       menuGroup: "danger",
   *       color: "error",
   *       when: { not: { field: "status", equals: "suspended" } },
   *       target: { type: "api", url: "/api/workspaces/{{params.id}}/suspend", successMessage: "$saas.wd.suspended" },
   *       confirm: { from: "/api/workspaces/{{params.id}}/suspend/impact" },
   *     },
   *   ],
   * })
   * ```
   */
  header?: PageHeaderSource;
  /**
   * Buttons right of the page title, in order: the same buttons as a table's
   * toolbar — a link (`page` or `external` target), a quick action
   * (`quickAction`), a drawer, a modal, an API call or an export, with their
   * confirmation and availability. A string `permission` names an action of
   * the page, relative to its permission id; `permissionId` is an absolute
   * one. A table view's own buttons join them with `placement: "header"`.
   *
   * With `header.fetchUrl`, each one may follow the record the header shows
   * (`when`, `unavailableWhen`) and sit in its "More actions" menu
   * (`menuGroup`): see {@link RecordAction}.
   */
  headerActions?: RecordAction[];
}

// A button without an id is keyed by its place in the header.
const HEADER_BUTTON_ID_PREFIX = "header-";

function declareHeaderButton(
  button: RecordAction,
  index: number,
): PageHeaderButtonDeclared {
  const { id, target, confirm, placement: _placement, ...rest } = button;
  const declared: PageHeaderButtonDeclared = {
    ...rest,
    id: id ?? `${HEADER_BUTTON_ID_PREFIX}${index}`,
    target: serializeActionTarget(target),
  };
  if (confirm) declared.confirm = serializeActionConfirm(confirm);
  return declared;
}

function dashboardLayout(
  componentName: string,
  options: DefaultLayoutOptions,
): ComponentInfo {
  const { headerActions, ...rest } = options;
  const layoutOptions: DefaultLayoutSerializedOptions = rest;
  if (headerActions) {
    layoutOptions.headerActions = headerActions.map(declareHeaderButton);
  }
  return { componentName, options: layoutOptions };
}

export function DefaultLayout(options?: DefaultLayoutOptions): ComponentInfo {
  return dashboardLayout("dms-default-layout", {
    fullWidth: true,
    ...options,
  });
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

/**
 * Dashboard frame of the settings area: the settings navigation next to the
 * page, in the one column width every settings page shares. Declared by
 * `settingsCategory`, so its pages and sub-categories get it without naming
 * it; a settings page declared with a layout of its own opts out.
 */
export function SettingsLayout(
  options?: Omit<DefaultLayoutOptions, "fullWidth">,
): ComponentInfo {
  return dashboardLayout("dms-settings-layout", { ...options });
}

export function EmptyLayout(): ComponentInfo {
  return {
    componentName: "dms-empty-layout",
    options: {},
  };
}
