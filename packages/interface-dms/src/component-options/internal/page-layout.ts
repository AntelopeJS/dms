import type { ButtonPermission } from "../../component";
import type { ActionTargetSerialized } from "../action-target";
import type {
  CustomButtonAvailability,
  CustomButtonSerialized,
} from "../button";
import type { DefaultLayoutOptions } from "../page-layout";

/**
 * A button of the page header as the layout serves it, right of the title.
 * One the layout declares (`DefaultLayout({ headerActions })`) carries its
 * `target`; one a component of the page places in the header (a table view's
 * `placement: "header"` button or add) names that component, which runs it.
 *
 * @internal
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
  /** Place among the header's buttons (`PageHeaderButton.order`). */
  order?: number;
}

/**
 * A header button as the layout holds it until a request is served: its
 * permission and availability are resolved per request, then dropped.
 * @internal
 */
export interface PageHeaderButtonDeclared extends PageHeaderButtonSerialized {
  /** Acts on the page's record (`PageHeaderButton.requiresRecord`). */
  requiresRecord?: boolean;
  permission?: ButtonPermission;
  permissionId?: string;
  availability?: CustomButtonAvailability;
}

/**
 * The options a page layout serializes, its header buttons held as declared.
 *
 * @internal
 */
export interface DefaultLayoutSerializedOptions extends Omit<
  DefaultLayoutOptions,
  "headerActions"
> {
  headerActions?: PageHeaderButtonDeclared[];
  /**
   * The page query the header buttons were served for, set only when one of
   * them declares an `availability` or the layout reads a `record`: the
   * header asks for its buttons again when the page URL's query no longer
   * matches it.
   */
  headerActionsQuery?: Readonly<Record<string, string>>;
  /** The route parameters (`:id`) of the page URL, likewise. */
  headerActionsParams?: Readonly<Record<string, string>>;
  /**
   * How the layout's `record` was read for the page URL it was served for,
   * set only when the layout reads one: the page leaves for its list once
   * a record it showed is `missing`.
   */
  recordStatus?: PageRecordStatus;
}

/**
 * How the page's record was read for one request: `found`, `missing` when its
 * loader answered none (not found, not the caller's), `error` when it threw.
 * The frontend takes a record going from `found` to `missing` for one that
 * was deleted.
 */
export type PageRecordStatus = "found" | "missing" | "error";

/**
 * The frontend component `TableView` emits.
 *
 * @internal
 */
export const TABLE_VIEW_COMPONENT_NAME = "dms-table-view";
