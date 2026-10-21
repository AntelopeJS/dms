import type {
  FieldRowLayout,
  FieldRowSpacing,
} from "../../../components/field-row/FieldRow.vue";
import {
  type FormField,
  type FormFieldOrGroup,
  isFieldGroup,
} from "../../../composables/form/types/field";

export type FormOrientation = "horizontal" | "vertical";
export type FormSurface = "card" | "container" | "section" | "sections";

/** How a form draws each row, through `DmsFieldRow`. */
export interface FormRowLayout {
  layout: FieldRowLayout;
  inset: boolean;
  spacing: FieldRowSpacing;
}

/** A form's rows: the classes of their list, and how each is drawn. */
export interface FormLayoutClasses {
  rows: string;
  row: FormRowLayout;
}

/** Classes of the bands around a form's rows. */
export interface FormSurfaceClasses {
  head: string;
  body: string;
  legend: string;
  foot: string;
}

// v2 record form (mockup form.html): horizontal rows are FieldRow's form
// rows, the label column beside the control and split by hairlines; the
// card pads them. Vertical rows stack the label above the control.
export const FORM_LAYOUT_CLASSES: Record<FormOrientation, FormLayoutClasses> = {
  horizontal: {
    rows: "flex flex-col py-1",
    row: { layout: "form", inset: false, spacing: "row" },
  },
  vertical: {
    rows: "flex flex-col gap-4 py-5",
    row: { layout: "stack", inset: false, spacing: "list" },
  },
};

// A card form draws its own head band and sticky footer band; inside a
// modal or drawer the container is the surface and already pads the body.
// The footer sticks to the bottom of the scroll area while the form runs
// past it, and sits under the fields when it fits. In a container it
// reaches over the scroll area's padding (`--dms-form-foot-*`, set by the
// drawer and the modal) to sit flush with its edges. A sectioned form has
// no surface of its own: each section is a card.
export const FORM_SURFACE_CLASSES: Record<FormSurface, FormSurfaceClasses> = {
  card: {
    head: "border-default border-b px-5 py-4.5",
    body: "px-5",
    legend: "pb-4",
    foot: "border-default sticky bottom-0 z-10 border-t bg-(--dms-bg-muted)/90 px-5 py-3 backdrop-blur-sm",
  },
  container: {
    head: "border-default border-b pb-4",
    body: "",
    legend: "pb-2",
    foot: "border-default bg-default sticky bottom-[calc(var(--dms-form-foot-pb,0px)*-1)] z-10 mt-2 -mx-[var(--dms-form-foot-px,0px)] -mb-[var(--dms-form-foot-pb,0px)] border-t px-[var(--dms-form-foot-px,0px)] pt-3 pb-[var(--dms-form-foot-pb,12px)]",
  },
  // The rows carry the 18px inset so their hairlines run edge to edge.
  section: {
    head: "border-default border-b px-[18px] py-4",
    body: "",
    legend: "px-[18px] pb-4",
    foot: "border-default sticky bottom-0 z-10 border-t bg-(--dms-bg-muted)/90 px-[18px] py-3 backdrop-blur-sm",
  },
  sections: {
    head: "pb-5",
    body: "",
    legend: "pt-3",
    foot: "border-default dms-card sticky bottom-4 z-10 mt-5 px-[18px] py-3",
  },
};

// v2 .st-row.is-form: FieldRow's form rows with the card's 18px inset.
export const SECTION_LAYOUT_CLASSES: FormLayoutClasses = {
  rows: "flex flex-col",
  row: { layout: "form", inset: true, spacing: "row" },
};

// Grouped controls sit side by side once the row is wide enough for its
// label column (FieldRow's 560px container step), whatever the viewport: a
// narrow modal or drawer form stacks them.
export const GROUP_FIELDS_CLASSES: Record<FormOrientation, string> = {
  horizontal: "flex flex-col gap-2.5 @min-[560px]:flex-row",
  vertical: "flex flex-col gap-2.5",
};

// Fields whose value is a block of its own (a table of rows, pairs, code,
// formatted text, a gallery): beside a 240px label they get what is left of
// a drawer, where a repeater falls into its stacked cards. They take the
// row's full width under their label instead, whatever the form's layout.
const WIDE_FIELD_COMPONENTS: ReadonlySet<string> = new Set([
  "dms-repeater",
  "dms-key-value",
  "dms-input-code",
  "dms-rich-text",
]);
// The same values shown read-only, drawn from the field's type.
const WIDE_FIELD_TYPES: ReadonlySet<string> = new Set([
  "array",
  "key_value",
  "code",
  "rich_text",
]);
// Files and images drop their list or gallery under the control when
// several are allowed.
const MULTIPLE_FILE_COMPONENTS: ReadonlySet<string> = new Set([
  "dms-file",
  "dms-image",
]);
// A textarea taller than the browser's three rows is a long text.
const SHORT_TEXTAREA_ROWS = 3;

/** The options of a field's control that make it wide. */
interface WideFieldOptions {
  multiple?: boolean;
  rows?: number;
}

/** Whether a field takes the row's full width, its label above it. */
export function isWideField(field: FormField): boolean {
  if (field.type && WIDE_FIELD_TYPES.has(field.type)) return true;
  const name = field.component.componentName ?? "";
  if (WIDE_FIELD_COMPONENTS.has(name)) return true;
  const options: WideFieldOptions = field.component.options ?? {};
  if (MULTIPLE_FILE_COMPONENTS.has(name)) return options.multiple === true;
  if (name !== "dms-textarea") return false;
  return (options.rows ?? 0) > SHORT_TEXTAREA_ROWS;
}

/**
 * How a form row is drawn: a wide field, or a group holding one, stacks its
 * label above it where the form would set it beside.
 */
export function entryRowLayout(
  row: FormRowLayout,
  fields: readonly FormField[],
): FormRowLayout {
  if (row.layout !== "form" || !fields.some(isWideField)) return row;
  return { ...row, layout: "stack" };
}

/** The fields a form entry draws: its own, or its group's. */
export function entryFields(entry: FormFieldOrGroup): FormField[] {
  return isFieldGroup(entry) ? entry.fields : [entry];
}
