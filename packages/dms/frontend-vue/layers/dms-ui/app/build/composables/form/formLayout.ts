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

export const CONTAINER_LAYOUT_CLASSES: Record<
  FormOrientation,
  FormLayoutClasses
> = {
  horizontal: {
    rows: "flex flex-col",
    row: { layout: "form", inset: false, spacing: "dense" },
  },
  vertical: {
    rows: "flex flex-col gap-3 py-3",
    row: { layout: "stack", inset: false, spacing: "list" },
  },
};

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

export const SECTION_LAYOUT_CLASSES: FormLayoutClasses = {
  rows: "flex flex-col",
  row: { layout: "form", inset: true, spacing: "row" },
};

export const GROUP_FIELDS_CLASSES: Record<FormOrientation, string> = {
  horizontal:
    "grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-x-3 gap-y-2.5",
  vertical: "flex flex-col gap-2.5",
};

const WIDE_FIELD_COMPONENTS: ReadonlySet<string> = new Set([
  "dms-repeater",
  "dms-key-value",
  "dms-input-code",
  "dms-rich-text",
]);

const WIDE_FIELD_TYPES: ReadonlySet<string> = new Set([
  "array",
  "key_value",
  "code",
  "rich_text",
]);

const MULTIPLE_FILE_COMPONENTS: ReadonlySet<string> = new Set([
  "dms-file",
  "dms-image",
]);

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

/** Classes of a grouped field: its own label above its control. */
export interface GroupMemberClasses {
  root: string;
  label: string;
}

export const GROUP_MEMBER_CLASSES: GroupMemberClasses = {
  root: "grid min-w-0 flex-1 content-start gap-1.5",
  label:
    "flex flex-wrap items-center gap-1 text-[12.5px] font-medium text-toned",
};
