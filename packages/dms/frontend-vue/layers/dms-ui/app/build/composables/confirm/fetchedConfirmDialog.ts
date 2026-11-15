import type {
  ConfirmDialog,
  ConfirmDialogField,
} from "#dms-core/app/types/confirm-dialog";

/** A component name as the registry compares it: case, a leading `lazy` and every non-alphanumeric character dropped. */
function registryKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^lazy/, "");
}

/**
 * The built-in inputs a fetched dialog's field may be drawn by: none sends a
 * request, reads a URL or draws another component.
 */
const REQUEST_FREE_INPUTS: ReadonlySet<string> = new Set(
  [
    "dms-input-text",
    "dms-input-textarea",
    "dms-input-email",
    "dms-input-number",
    "dms-input-percentage",
    "dms-input-phone",
    "dms-input-password",
    "dms-input-color",
    "dms-input-time",
    "dms-input-select",
    "dms-radio-group",
    "dms-segmented-select",
    "dms-choice-cards",
    "dms-input-checkbox",
    "dms-input-switch",
    "dms-boolean-card",
    "dms-input-slider",
    "dms-input-tags",
    "dms-input-calendar",
    "dms-date-picker",
    "dms-date-picker-range",
  ].map(registryKey),
);

const isRequestFreeField = ({ component }: ConfirmDialogField): boolean =>
  component.componentName !== undefined &&
  REQUEST_FREE_INPUTS.has(registryKey(component.componentName));

/**
 * The dialog a `confirm: { from }` URL answered, as the dashboard draws it.
 * The answer is data anyone who writes to that route controls, and the owner
 * confirms it with their session: its `component` is left out, and a field
 * drawn by any input but a request-free built-in one refuses the whole dialog
 * (`undefined`), since leaving the field out would change what the action
 * sends.
 */
export function drawableFetchedDialog(
  dialog: ConfirmDialog,
): ConfirmDialog | undefined {
  const { component: _component, ...drawn } = dialog;
  return (drawn.fields ?? []).every(isRequestFreeField) ? drawn : undefined;
}
