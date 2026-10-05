import type { ButtonPermission, ComponentInfo } from "../component";
import { serializeActionConfirm } from "./confirm-dialog";
import {
  type ActionTargetSerialized,
  serializeActionTarget,
} from "./types/action-target";
import type {
  CustomButton,
  CustomButtonAvailability,
  CustomButtonSerialized,
} from "./types/custom-button";

/**
 * A button of the page header as the layout serves it, right of the title.
 * One the layout declares (`DefaultLayout({ headerActions })`) carries its
 * `target`; one a component of the page places in the header (a table view's
 * `placement: "header"` button or add) names that component, which runs it.
 */
export interface PageHeaderButtonSerialized extends Omit<
  CustomButtonSerialized,
  "id" | "target"
> {
  /** Key of the button in the header. */
  id: string;
  target?: ActionTargetSerialized;
  /** The component of the page the button belongs to, which runs it. */
  componentId?: string;
  /** Id of that component's button; absent for its built-in add action. */
  buttonId?: string;
}

/**
 * A header button as the layout holds it until a request is served: its
 * permission and availability are resolved per request, then dropped.
 * @internal
 */
export interface PageHeaderButtonDeclared extends PageHeaderButtonSerialized {
  permission?: ButtonPermission;
  availability?: CustomButtonAvailability;
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
   * confirmation and availability. A string `permission` is a permission id.
   * A table view's own buttons join them with `placement: "header"`.
   */
  headerActions?: CustomButton[];
}

/** The options a page layout serializes, its header buttons held as declared. */
export interface DefaultLayoutSerializedOptions extends Omit<
  DefaultLayoutOptions,
  "headerActions"
> {
  headerActions?: PageHeaderButtonDeclared[];
}

// A button without an id is keyed by its place in the header.
const HEADER_BUTTON_ID_PREFIX = "header-";

function declareHeaderButton(
  button: CustomButton,
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

export function DefaultLayout(options?: DefaultLayoutOptions): ComponentInfo {
  const { headerActions, ...rest } = options ?? {};
  const layoutOptions: DefaultLayoutSerializedOptions = {
    fullWidth: true,
    ...rest,
  };
  if (headerActions) {
    layoutOptions.headerActions = headerActions.map(declareHeaderButton);
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
