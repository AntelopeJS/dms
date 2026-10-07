import type { ButtonPermission } from "./component";

/**
 * Who may use a button, a row action, a tab, a view or a header button.
 *
 * `permission` names an action relative to the owner — the table view for its
 * buttons, row actions, tabs and views, the page for a header button — like
 * `"edit"`, or is an `Action` of any component. `permissionId` is an absolute
 * permission id (`"pages.sales.invoices.export"`), for the rare gate that is
 * neither. `permissionId` wins when both are set.
 */
export interface PermissionGate {
  permission?: ButtonPermission;
  permissionId?: string;
}
