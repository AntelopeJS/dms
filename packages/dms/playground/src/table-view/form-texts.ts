import type {
  FormContainerPages,
  FormContainerPageTexts,
} from "@antelopejs/interface-dms/base/table-view";

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
 * The `formContainer.pages` texts of a demo table over `entity`: "New task",
 * "Edit task", "Task details" and their descriptions, from
 * `demo.forms.<entity>`. Valid in a drawer, a modal or a page.
 */
export function demoFormPages(
  entity: DemoEntity,
): FormContainerPages<FormContainerPageTexts> {
  const key = `$demo.forms.${entity}`;
  return {
    new: {
      displayName: `${key}.new_title`,
      description: `${key}.new_description`,
    },
    edit: {
      displayName: `${key}.edit_title`,
      description: `${key}.edit_description`,
    },
    details: {
      displayName: `${key}.view_title`,
      description: `${key}.view_description`,
    },
  };
}

/** The title and description of a relation picker's "add" drawer. */
export function demoAddForm(
  entity: DemoEntity | "department" | "member",
): FormContainerPageTexts {
  const key = `$demo.forms.${entity}`;
  return {
    displayName: `${key}.new_title`,
    description: `${key}.new_description`,
  };
}
