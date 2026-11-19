/** @internal @packageDocumentation */
import type { ModalSize } from "../../types/size";
import type { FormBuilder } from "../../form-types";

/**
 * Heading texts of one of the forms a table view opens, whatever container
 * opens it: the page, drawer or modal title and the line under it. Left out,
 * the forms read "New entry", "Edit entry" and "Entry details".
 */
export interface FormContainerPageTexts {
  /** Title of the page, drawer or modal. `$`-prefixed: an i18n key. */
  displayName?: string;
  /** Line under the title. `$`-prefixed: an i18n key. */
  description?: string;
}

/** One form of a page-mode table view: its texts, and the page it opens on. */
export interface FormContainerPageConfig extends FormContainerPageTexts {
  urlSlug?: string;
  /**
   * When true, the DMS will not auto-create a form page for this action.
   * Use this when you have a manually registered page (via CustomComponent) at the same URL.
   * The urlSlug will still be used for navigation.
   */
  customPage?: boolean;
}

/** The forms a table view opens: add (`new`), edit and `details`. */
export interface FormContainerPages<
  Page extends FormContainerPageTexts = FormContainerPageConfig,
> {
  new?: Page;
  edit?: Page;
  details?: Page;
}

/**
 * Where the add, edit and details forms of a table view open, and their
 * titles: `pages` names them in every container ("New task", "Edit task",
 * "Task details"); a page-mode entry also sets the page's URL.
 */
export type FormContainer =
  | {
      type: "drawer";
      /**
       * The edge the drawer slides in from, as a drawer action target's
       * `direction`: `bottom` (the default), a sheet as wide as the window,
       * or `right`, a side sheet spanning the window's height, 600px wide
       * from `lg`, which the user widens by its inner edge. A form opens from
       * no other edge.
       */
      direction?: "bottom" | "right";
      pages?: FormContainerPages<FormContainerPageTexts>;
    }
  | {
      type: "modal";
      size?: ModalSize;
      pages?: FormContainerPages<FormContainerPageTexts>;
    }
  | {
      type: "page";
      pages?: FormContainerPages;
    };

/**
 * Settles one of the forms a table view generates, as a module writes its own
 * `Form`: it receives the builder, and what it declares on it (`.watch()`…)
 * holds wherever the form opens.
 */
export type TableViewFormSetup = (form: FormBuilder) => void;

/**
 * Page-mode form URLs, resolved against the slug of the page the table view is
 * mounted on. They keep the `:id` placeholder of their slug: the frontend
 * substitutes the row id when it navigates.
 */
export interface TableViewFormPageUrls {
  new: string;
  edit: string;
  view: string;
}
