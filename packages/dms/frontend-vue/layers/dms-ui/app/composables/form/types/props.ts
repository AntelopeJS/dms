import type { FormFieldOrGroup, FormSection, FormSectionNav } from "./field";
import type { validateFormState } from "../../../build/composables/form/formValidation";
import type {
  FormKind,
  FormSaveMode,
} from "../../../build/composables/form/formFooter";

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
  /** Every entry of the form, the sections' included. */
  fields: FormFieldOrGroup[];
  /**
   * Titled cards splitting the fields, reached from a navigation that marks
   * the ones holding unsaved changes or errors. Entries in no section come
   * first.
   */
  sections?: FormSection[];
  /**
   * `side`: a list beside the sections following the scroll (chips on a
   * narrow form); `jump`: chips above them; `none`. Defaults to `side` from
   * three sections.
   */
  sectionNav?: FormSectionNav;
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
   * `record` (default): keeps its values once saved, no save controls until
   * a value changes, then Save and Cancel (or Discard, with nowhere to go
   * back to). `action` (send, invite, run): Reset and
   * its submit label once a value changes, emptied after a submit.
   */
  kind?: FormKind;
  /** Where Cancel leads a record form on a page; no Cancel without it. */
  backTo?: string;
  successMessage?: string;
  errorMessage?: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Backend JSON schemas are accepted before conversion by jsonSchemaToZod; a parsed field-value contract would exclude schema keywords and extensions.
  schema?: Record<string, unknown>;
  watchActions?: WatchAction[];
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Success callbacks expose the raw server response and submitted data for application extensions; neither payload has a closed shared schema.
  onSuccessCallback?: (response?: unknown, data?: unknown) => void;
  fieldsOrientation?: "horizontal" | "vertical";
  submitDefaults?: Record<
    string,
    Parameters<typeof validateFormState>[1][string]
  >;
  containerId?: string;
  redirectOnSuccess?: string;
  /** Field of the loaded row a page form names in the breadcrumb. */
  labelKey?: string;
  /** Without the record `fetchUrl` names, "No entry selected", no fields. */
  requiresRecord?: boolean;
}
