export type FormOrientation = "horizontal" | "vertical";
export type FormSurface = "card" | "container" | "section" | "sections";

/** Classes of a form's rows: the list, a row, its label column. */
export interface FormLayoutClasses {
  rows: string;
  row: string;
  meta: string;
  description: string;
}

/** Classes of the bands around a form's rows. */
export interface FormSurfaceClasses {
  head: string;
  body: string;
  legend: string;
  foot: string;
}

// v2 record form (mockup form.html): horizontal rows put the label column
// (minmax(180px, 38%)) beside the control, split by hairlines, and collapse
// to one column under 560px of form width; vertical rows stack them.
export const FORM_LAYOUT_CLASSES: Record<FormOrientation, FormLayoutClasses> = {
  horizontal: {
    rows: "@container flex flex-col divide-y divide-muted py-1",
    row: "grid gap-2 py-4 @min-[560px]:grid-cols-[minmax(180px,38%)_minmax(0,1fr)] @min-[560px]:gap-6",
    meta: "grid content-start gap-px @min-[560px]:pt-1.5",
    description: "text-muted max-w-[34ch] text-[12.5px]",
  },
  vertical: {
    rows: "flex flex-col gap-4 py-5",
    row: "grid gap-1.5",
    meta: "grid gap-px",
    description: "text-dimmed text-xs",
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

// v2 .st-row.is-form: a 240px label column, 18px row inset.
export const SECTION_LAYOUT_CLASSES: FormLayoutClasses = {
  rows: "@container flex flex-col divide-y divide-muted",
  row: "grid gap-2 px-[18px] py-4 @min-[560px]:grid-cols-[minmax(0,240px)_minmax(0,1fr)] @min-[560px]:gap-6",
  meta: "grid content-start gap-px @min-[560px]:pt-1.5",
  description: "text-muted text-[12.5px] leading-normal",
};

// Grouped controls sit side by side once the form is wide enough for its
// label column (the same 560px container step), whatever the viewport: a
// narrow modal or drawer form stacks them.
export const GROUP_FIELDS_CLASSES: Record<FormOrientation, string> = {
  horizontal: "flex flex-col gap-2.5 @min-[560px]:flex-row",
  vertical: "flex flex-col gap-2.5",
};
