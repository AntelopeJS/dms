import type { DrawerDirection } from "../../../composables/containers/types";

export enum TableRowAction {
  view = "view",
  edit = "edit",
  new = "new",
  duplicate = "duplicate",
}

export enum FormContainerType {
  drawer = "drawer",
  modal = "modal",
  page = "page",
}

export const DEFAULT_FORM_CONTAINER_TYPE = FormContainerType.page;

/** The edges a table view's `drawer` form slides in from. */
export type FormDrawerDirection = Extract<DrawerDirection, "bottom" | "right">;

/** The edge a `drawer` form slides in from when its container names none. */
export const DEFAULT_FORM_DRAWER_DIRECTION: FormDrawerDirection = "bottom";
