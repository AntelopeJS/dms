import { type ComputedRef, type Ref, watch } from "vue";
import type { FormField } from "../../../composables/form/types/field";
import {
  type InstantSave,
  useInstantSave,
} from "../instant-save/useInstantSave";

type FormValues = Record<string, unknown>;

// Fields typed in rather than picked: they save once typing pauses, a pick
// (a select, a switch, a date) at once. A field without a type is a text.
const TYPED_FIELD_TYPES = new Set([
  "string",
  "email",
  "url",
  "phone",
  "password",
  "number",
  "price",
  "percentage",
  "rich_text",
  "string_time",
]);

/** Whether a field's changes wait for typing to pause before saving. */
export function savesOnPause(
  field: Pick<FormField, "type" | "localized">,
): boolean {
  return !!field.localized || TYPED_FIELD_TYPES.has(field.type ?? "string");
}

export interface InstantFormOptions {
  state: Ref<FormValues>;
  fields: ComputedRef<FormField[]>;
  /** Until the user acts on the form, a change is a control settling. */
  isTouched: () => boolean;
  /** Validates one field: an invalid value is shown, never sent. */
  isFieldValid: (field: FormField) => Promise<boolean>;
  /** Sends the changed fields, alone (a partial submit). */
  submit: (changes: FormValues) => Promise<void>;
  /** Says why a save was refused, once its values are put back. */
  onRefused: (error: unknown) => void;
}

export interface InstantForm extends InstantSave<FormValues> {
  /** The form loaded or was reset: its values are the confirmed ones. */
  start: () => void;
}

const snapshot = (value: unknown): string => JSON.stringify(value) ?? "";
const clone = (value: unknown): unknown =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

/**
 * The instant save of a `Form` (`saveMode: "instant"`): each field the user
 * changes is validated, then saved alone through the shared instant save —
 * a text once typing pauses, a pick at once — and put back to the value the
 * server last confirmed when refused.
 */
export function useInstantForm(options: InstantFormOptions): InstantForm {
  // The value each field shows as far as the save knows: a value put back
  // after a refusal is not a change of the user's.
  const shown = new Map<string, string>();

  const instant = useInstantSave<FormValues>({
    read: (key) => options.state.value[key],
    write: (key, value) => {
      shown.set(key, snapshot(value));
      options.state.value[key] = clone(value);
    },
    save: options.submit,
    onError: options.onRefused,
  });

  function start(): void {
    const values: FormValues = {};
    for (const field of options.fields.value) {
      const value = options.state.value[field.id];
      shown.set(field.id, snapshot(value));
      values[field.id] = clone(value);
    }
    instant.confirm(values);
  }

  async function saveField(field: FormField): Promise<void> {
    if (!(await options.isFieldValid(field))) {
      instant.cancel(field.id);
      return;
    }
    const value = clone(options.state.value[field.id]);
    instant.queue(field.id, value, { debounce: savesOnPause(field) });
  }

  watch(
    () => options.fields.value.map((field) => options.state.value[field.id]),
    () => {
      for (const field of options.fields.value) {
        const value = options.state.value[field.id];
        if (shown.get(field.id) === snapshot(value)) continue;
        shown.set(field.id, snapshot(value));
        if (!options.isTouched()) {
          instant.confirm({ [field.id]: clone(value) });
          continue;
        }
        void saveField(field);
      }
    },
    { deep: true },
  );

  return { ...instant, start };
}
