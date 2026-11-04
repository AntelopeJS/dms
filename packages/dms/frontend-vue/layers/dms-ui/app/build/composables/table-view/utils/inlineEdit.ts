import type {
  FormField,
  FormFieldOrGroup,
} from "../../../../composables/form/types/field";
import { isFieldGroup } from "../../../../composables/form/types/field";
import type { TableViewColumn } from "../../../../composables/table-view/types/column";
import type { TableViewInlineEditConfig } from "../../../../composables/table-view/types/config";

/**
 * How an edited cell saves: `type` on Enter or when the cell loses focus,
 * `pick` as soon as a value is picked (a select, a date), `toggle` as the
 * control toggles, without an edit state (a switch, a checkbox).
 */
export type InlineEditCommit = "type" | "pick" | "toggle";

/** How a cell opens the picker of its control (see `opensPicker`). */
export type InlineEditPickerOpening = "defaultOpen" | "click";

/** What a simple control needs to be edited in a cell. */
interface InlineEditControl {
  commit: InlineEditCommit;
  /**
   * The control is a trigger opening a picker, which the cell opens with the
   * edit rather than asking for a second click: through the control's
   * `defaultOpen` prop, or by clicking its trigger.
   */
  opensPicker?: InlineEditPickerOpening;
}

/** A column edited in place: its form field and how its cell saves. */
export interface InlineEditColumn extends InlineEditControl {
  columnId: string;
  field: FormField;
}

const INLINE_EDIT_CONTROLS: Record<string, InlineEditControl> = {
  inputtext: { commit: "type" },
  inputemail: { commit: "type" },
  inputphone: { commit: "type" },
  inputnumber: { commit: "type" },
  inputpercentage: { commit: "type" },
  inputtime: { commit: "type" },
  inputcolor: { commit: "type" },
  select: { commit: "pick", opensPicker: "defaultOpen" },
  datepicker: { commit: "pick", opensPicker: "click" },
  segmentedselect: { commit: "pick" },
  switch: { commit: "toggle" },
  checkbox: { commit: "toggle" },
};

const LIST_VALUE_OPTIONS = ["multiple", "range"];

const DMS_COMPONENT_PREFIX = "dms";

/** `dms-input-text`, `DmsInputText` and `InputText` all read `inputtext`. */
function normalizeControlName(name: string): string {
  const flat = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return flat.startsWith(DMS_COMPONENT_PREFIX)
    ? flat.slice(DMS_COMPONENT_PREFIX.length)
    : flat;
}

/** The fields of a form, its groups' included. */
export function flattenFormFields(
  entries: ReadonlyArray<FormFieldOrGroup>,
): FormField[] {
  return entries.flatMap((entry) =>
    isFieldGroup(entry) ? entry.fields : [entry],
  );
}

/**
 * How a field of the edit form is edited in a cell, or `undefined` when it
 * is not: read-only there, localized (one value per language), or drawn by a
 * control other than a simple one.
 */
export function inlineEditControl(
  field: FormField,
): InlineEditControl | undefined {
  if (field.disabled || field.readonly || field.localized) return undefined;
  const name = field.component?.componentName;
  if (!name) return undefined;
  const control = INLINE_EDIT_CONTROLS[normalizeControlName(name)];
  if (!control) return undefined;
  const options = (field.component.options ?? {}) as Record<string, unknown>;
  if (LIST_VALUE_OPTIONS.some((key) => !!options[key])) return undefined;
  return control;
}

/** The ids `inlineEdit` restricts the edit to, or `undefined` for all. */
function restrictedFieldIds(
  inlineEdit: boolean | TableViewInlineEditConfig,
): Set<string> | undefined {
  if (typeof inlineEdit !== "object" || !inlineEdit.columns) return undefined;
  return new Set(inlineEdit.columns);
}

/**
 * The columns the grid edits in place, by column id: listed, in the edit
 * form (the fields it leaves out are hidden there) and edited there by a
 * simple control, among those `inlineEdit.columns` names. None without the
 * option or without an edit form, which the server leaves out for a caller
 * without the edit action.
 */
export function resolveInlineEditColumns(
  inlineEdit: boolean | TableViewInlineEditConfig | undefined,
  editFields: ReadonlyArray<FormFieldOrGroup> | undefined,
  columns: ReadonlyArray<
    Pick<TableViewColumn, "id" | "accessorKey" | "listable">
  >,
): Map<string, InlineEditColumn> {
  const resolved = new Map<string, InlineEditColumn>();
  if (!inlineEdit || !editFields) return resolved;
  const restricted = restrictedFieldIds(inlineEdit);
  const fields = new Map(
    flattenFormFields(editFields).map((field) => [field.id, field]),
  );
  for (const column of columns) {
    if (!column.listable) continue;
    if (restricted && !restricted.has(column.accessorKey)) continue;
    const field = fields.get(column.accessorKey);
    const control = field && inlineEditControl(field);
    if (!field || !control) continue;
    const columnId = column.id ?? column.accessorKey;
    resolved.set(columnId, { columnId, field, ...control });
  }
  return resolved;
}
