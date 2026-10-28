import { nextTick, watch } from "vue";
import { errorFieldId } from "./formSections";
import { scrollWithin } from "../../utils/scrollWithin";

interface FormFocusSource {
  element: () => HTMLElement | undefined;
  loading: () => boolean | undefined;
  fieldIds: () => readonly string[];
}

const PREFERRED_FOCUS =
  "[data-reka-calendar-cell-trigger][tabindex='0'], [role='grid'] [tabindex='0']";
const FOCUSABLE =
  "input:not([type='hidden']):not([disabled]):not([tabindex='-1']), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [contenteditable='true'], [tabindex]:not([tabindex='-1'])";

/** The form's field lookup, validation settling and focus sequence. */
export function formComponentFocus(source: FormFocusSource) {
  function fieldControl(name: string | undefined): HTMLElement | null {
    const element = source.element();
    if (!name || !element?.querySelector) return null;
    return element.querySelector<HTMLElement>(`[id="${CSS.escape(name)}"]`);
  }

  function fieldRow(name: string | undefined): HTMLElement | null {
    const element = source.element();
    if (!name || !element?.querySelector) return null;
    return element.querySelector<HTMLElement>(
      `[data-field="${CSS.escape(name)}"]`,
    );
  }

  async function formSettled(): Promise<void> {
    await nextTick();
    if (!source.loading()) return;
    await new Promise<void>((resolve) => {
      const stop = watch(source.loading, (busy) => {
        if (busy) return;
        stop();
        resolve();
      });
    });
    await nextTick();
  }

  async function focusField(name: string | undefined): Promise<void> {
    await formSettled();
    const fieldId = errorFieldId(name, source.fieldIds()) ?? name;
    const control = fieldControl(name) ?? fieldControl(fieldId);
    const row = fieldRow(fieldId);
    const target = control?.matches(FOCUSABLE)
      ? control
      : (control?.querySelector<HTMLElement>(PREFERRED_FOCUS) ??
        control?.querySelector<HTMLElement>(FOCUSABLE) ??
        row?.querySelector<HTMLElement>(FOCUSABLE));
    if (target) {
      target.focus();
      return;
    }
    if (row) scrollWithin(row, { block: "center" });
  }

  async function revealField(fieldId: string): Promise<void> {
    await formSettled();
    const row = fieldRow(fieldId);
    if (row) scrollWithin(row, { block: "center" });
    await focusField(fieldId);
  }

  return { focusField, revealField };
}
