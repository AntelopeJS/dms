import type { FormFieldOrGroup } from "./field";

interface FormComponentProps {
  componentId: string;
  pageId: string;
  routeParams?: Record<string, string>;
  watchActions?: WatchAction[];
  childCount?: number;
}

export interface FormProps extends FormComponentProps {
  title?: string;
  description?: string;
  fields: FormFieldOrGroup[];
  fetchUrl?: string;
  fetchUrlMethod?: HttpMethod;
  submitUrl?: string;
  submitUrlMethod?: HttpMethod;
  submitLabel?: string;
  /** Whether the buttons show; left out, once there is somewhere to submit to. */
  showActions?: boolean;
  /**
   * Sticky save bar, shown while there are unsaved changes, in place of the
   * footer buttons.
   */
  saveBar?: boolean;
  /**
   * Cancel while there is nothing to save, and the record wording once there
   * is ("Unsaved changes", Discard, Save): a table view's form page. Implied
   * in a drawer or a modal. Left out on a page, the form is an action form:
   * no buttons until a value changes, then Reset and its submit label.
   */
  cancellable?: boolean;
  successMessage?: string;
  errorMessage?: string;
  schema?: Record<string, unknown>;
  watchActions?: WatchAction[];
  onSuccessCallback?: (response?: unknown, data?: unknown) => void;
  fieldsOrientation?: "horizontal" | "vertical";
  submitDefaults?: Record<string, unknown>;
  containerId?: string;
  redirectOnSuccess?: string;
  /** After a successful submit, puts every field back to the value it opened with. */
  resetOnSuccess?: boolean;
  /** Field of the loaded row a page form names in the breadcrumb. */
  recordLabelKey?: string;
}
