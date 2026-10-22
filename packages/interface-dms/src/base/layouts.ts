import type { ComponentInfo } from "../component";
import { serializeActionConfirm } from "./internal/confirm-dialog";
import { serializeActionTarget } from "./types/internal/action-target";
import type { CustomButton } from "./types/custom-button";
import type {
  DefaultLayoutSerializedOptions,
  PageHeaderButtonDeclared,
} from "./internal/layouts";

/** A button of the page header: a `CustomButton` that may say where it goes. */
export interface PageHeaderButton extends CustomButton {
  /**
   * Place among the header's buttons, smallest first; defaults to `0`. The
   * header sorts the buttons the layout serves and the actions a Vue
   * component of the page adds (`usePageHeaderActions(render, { order })`)
   * together; at an equal order the served buttons come first, in the order
   * declared. A table view's buttons placed in the header (`placement:
   * "header"`) take `0`.
   */
  order?: number;
  /**
   * The button acts on the record the page shows (the layout's `record`): it
   * is disabled while the record loads, and left out of a page whose record
   * cannot be read (not found). A target naming `{{record.X}}` implies it.
   */
  requiresRecord?: boolean;
}

/**
 * The record a page shows, which its header buttons read: a target may name
 * its fields as `{{record.X}}` (an address in a maps link).
 */
export interface PageRecordSource {
  /**
   * URL answering the record, typically its controller's `get` route;
   * `{{params.X}}` and `{{query.X}}` are filled in from the page URL.
   * @example "/api/sites/get?id={{params.id}}"
   */
  fetchUrl: string;
}

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
   * Buttons right of the page title, in order: the same buttons as a table's
   * toolbar — a link (`page` or `external` target), a quick action
   * (`quickAction`), a drawer, a modal, an API call or an export, with their
   * confirmation and availability. A string `permission` names an action of
   * the page, relative to its permission id; `permissionId` is an absolute
   * one. A table view's own buttons join them with `placement: "header"`.
   * An `availability` disables a button for one request, or hides it.
   */
  headerActions?: PageHeaderButton[];
  /**
   * The record the page shows, for the header buttons that act on it
   * (`requiresRecord`, or a `{{record.X}}` in their target). Read once per
   * page: a block reading the same `fetchUrl` shares the request.
   */
  record?: PageRecordSource;
}

// A button without an id is keyed by its place in the header.
const HEADER_BUTTON_ID_PREFIX = "header-";

function declareHeaderButton(
  button: PageHeaderButton,
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
