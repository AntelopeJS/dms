import type { FormFieldOrGroup } from "./field";
import type { FormKind, FormSaveMode } from "../formFooter";

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
  /**
   * How the form offers to save: `bar` (default), a sticky bar shown while
   * there are unsaved changes; `footer`, the footer buttons; `none`; `instant`
   * saves like `bar` for now. In a drawer or a modal, the container's footer.
   */
  saveMode?: FormSaveMode;
  /**
   * `record` (default): keeps its values once saved, Cancel while clean when
   * it has somewhere to go back to. `action` (send, invite, run): Reset and
   * its submit label once a value changes, emptied after a submit.
   */
  kind?: FormKind;
  /** Where Cancel leads a record form on a page; no Cancel without it. */
  backTo?: string;
  successMessage?: string;
  errorMessage?: string;
  schema?: Record<string, unknown>;
  watchActions?: WatchAction[];
  onSuccessCallback?: (response?: unknown, data?: unknown) => void;
  fieldsOrientation?: "horizontal" | "vertical";
  submitDefaults?: Record<string, unknown>;
  containerId?: string;
  redirectOnSuccess?: string;
  /** Field of the loaded row a page form names in the breadcrumb. */
  labelKey?: string;
}
