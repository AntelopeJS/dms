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
