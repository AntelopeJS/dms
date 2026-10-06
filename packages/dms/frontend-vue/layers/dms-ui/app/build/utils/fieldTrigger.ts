// Popover triggers that stand in for a field (date picker, cascader) are
// outline UButtons: this restyles them onto the v2 field look of the input
// theme (layers/dms-layout/app/theme/form-controls.ts), so a trigger never
// differs from the text inputs around it.

/** Classes of the trigger button itself. */
export const FIELD_TRIGGER_CLASS = [
  "h-8 gap-2 px-2.5 text-base/5 md:text-[13px] font-normal text-highlighted",
  "bg-(--dms-bg-field) ring-accented shadow-(--shadow-xs)",
  "hover:bg-(--dms-bg-field) hover:ring-(--dms-field-border-hover)",
  "active:bg-(--dms-bg-field) active:scale-100",
  "focus-visible:outline-3 focus-visible:outline-(--dms-accent-tint-strong) focus-visible:ring-primary",
  "disabled:bg-(--dms-bg-muted) disabled:shadow-none",
].join(" ");

/** Slot classes: 16px dimmed icons, like the input's leading/trailing icons. */
export const FIELD_TRIGGER_UI = {
  leadingIcon: "size-4 text-dimmed",
  trailingIcon: "size-4 text-dimmed ms-auto",
};

/** Icon closing a field trigger, as on v2 select triggers. */
export const FIELD_TRIGGER_ICON = "i-ph-caret-up-down";

/**
 * An invalid trigger, as UFormField marks the inputs it wraps (color "error"
 * plus highlight): the error border, kept on hover and focus, with the error
 * halo. Applied after FIELD_TRIGGER_CLASS, it wins the merge.
 */
export const FIELD_TRIGGER_INVALID_CLASS =
  "ring-error hover:ring-error focus-visible:ring-error focus-visible:outline-(--dms-error-tint)";

/**
 * The same on a bordered surface standing in for a field (rich-text editor,
 * colour swatch, upload tile): the error border and focus halo. A plain
 * element merges no classes, so it takes these instead of its own border
 * colour, focus border and outline colour, never on top of them.
 */
export const FIELD_SURFACE_INVALID_CLASS =
  "border-error hover:border-error focus-within:border-error has-focus-visible:border-error outline-(--dms-error-tint)";

/**
 * A field whose control has no border of its own (a tree, an inline
 * calendar): an error ring around it.
 */
export const FIELD_RING_INVALID_CLASS = "rounded-lg ring-1 ring-error";
