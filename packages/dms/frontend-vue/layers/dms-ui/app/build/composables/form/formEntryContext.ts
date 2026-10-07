import type { InjectionKey, Ref } from "vue";
import type { SaveStatusState } from "../../../components/save-bar/SaveStatus.vue";
import type { FormField } from "../../../composables/form/types/field";
import type { FormData } from "../../../composables/form/types/value";
import type { FormLayoutClasses } from "./formLayout";

/**
 * What the rows of a form read from the form rendering them: its values,
 * the state of each field and how its rows are laid out.
 */
export interface FormEntryContext {
  state: Ref<Record<string, unknown>>;
  initialValues: Ref<FormData>;
  loading: Ref<boolean>;
  componentId: string;
  pageId: string;
  routeParams?: Record<string, string>;
  /** The row classes of a section card (`true`) or of the form itself. */
  layoutClasses: (inSection: boolean) => FormLayoutClasses;
  isFieldHidden: (field: FormField) => boolean;
  isFieldDisabled: (field: FormField) => boolean;
  isFieldRequired: (field: FormField) => boolean;
  /**
   * Whether a field points out a change waiting to be saved: not in an
   * instant form (nothing waits) nor in an action form (nothing was saved).
   */
  showsChanges: boolean;
  /** Whether a field holds a value it did not load (or last save) with. */
  isFieldChanged: (fieldId: string) => boolean;
  /** The value a field loaded (or was last saved) with. */
  baselineValue: (fieldId: string) => unknown;
  /** The instant-save state of a field: `idle` unless the form saves so. */
  fieldSaveState: (fieldId: string) => SaveStatusState;
  /** Saves again the changes whose save failed. */
  retrySave: () => void;
}

export const FORM_ENTRY_CONTEXT_KEY: InjectionKey<FormEntryContext> = Symbol(
  "dms-form-entry-context",
);

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/** A text matched literally inside a regular expression. */
export function escapeRegExp(text: string): string {
  return text.replace(REGEXP_SPECIALS, "\\$&");
}

/**
 * The errors of a field: its own and those of its parts (an address's
 * street, a gallery's image), which zod names `<id>.<part>`.
 */
export function fieldErrorPattern(id: string): RegExp {
  return new RegExp(`^${escapeRegExp(id)}(\\.|$)`);
}
