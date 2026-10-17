import type {
  FieldRowLayout,
  FieldRowSpacing,
} from "../../../components/field-row/FieldRow.vue";

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

// Grouped controls share the row while each keeps a usable width (11rem: a
// date, a select showing its value), and wrap onto the next line once they
// would shrink below it, so a group of five in a modal, a drawer or on a
// phone wraps instead of drawing its controls over one another. A member
// alone on its line takes the whole width; `min(100%, ...)` keeps a row
// narrower than the minimum from overflowing.
export const GROUP_FIELDS_CLASSES: Record<FormOrientation, string> = {
  horizontal:
    "grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-x-3 gap-y-2.5",
  vertical: "flex flex-col gap-2.5",
};

/** Classes of a grouped field: its own label above its control. */
export interface GroupMemberClasses {
  root: string;
  label: string;
}

// A member's label is a step below the group's (FieldRow's 13px semibold
// label), which heads the cluster.
export const GROUP_MEMBER_CLASSES: GroupMemberClasses = {
  root: "grid min-w-0 flex-1 content-start gap-1.5",
  label:
    "flex flex-wrap items-center gap-1 text-[12.5px] font-medium text-toned",
};
