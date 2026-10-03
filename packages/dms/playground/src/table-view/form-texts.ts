import type { TableViewOptions } from "@antelopejs/interface-dms/base/table-view";

/** The kinds of rows the demo tables hold, as named in the demo locales. */
export type DemoEntity =
  | "task"
  | "user"
  | "order"
  | "invoice"
  | "contact"
  | "category"
  | "product"
  | "assignment"
  | "member_assignment";

/**
 * The `formTexts` of a demo table over `entity`: "New task", "Edit task",
 * "Task details" and their descriptions, from `demo.forms.<entity>`.
 */
export function demoFormTexts(
  entity: DemoEntity,
): NonNullable<TableViewOptions["formTexts"]> {
  const key = `$demo.forms.${entity}`;
  return {
    new: { title: `${key}.new_title`, description: `${key}.new_description` },
    edit: {
      title: `${key}.edit_title`,
      description: `${key}.edit_description`,
    },
    view: {
      title: `${key}.view_title`,
      description: `${key}.view_description`,
    },
  };
}

/** The title and description of a relation picker's "add" drawer. */
export function demoAddTexts(entity: DemoEntity | "department" | "member"): {
  addTitle: string;
  addDescription: string;
} {
  const key = `$demo.forms.${entity}`;
  return {
    addTitle: `${key}.new_title`,
    addDescription: `${key}.new_description`,
  };
}
