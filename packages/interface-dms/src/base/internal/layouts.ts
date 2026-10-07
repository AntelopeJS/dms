import type { ButtonPermission } from "../../component";
import type { ActionTargetSerialized } from "../types/action-target";
import type {
  CustomButtonAvailability,
  CustomButtonSerialized,
} from "../types/custom-button";
import type { DefaultLayoutOptions } from "../layouts";

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
}

/**
 * A header button as the layout holds it until a request is served: its
 * permission and availability are resolved per request, then dropped.
 * @internal
 */
export interface PageHeaderButtonDeclared extends PageHeaderButtonSerialized {
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
}
