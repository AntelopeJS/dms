const CHOICE_CARD = [
  "items-start rounded-[10px] border-accented bg-default shadow-(--shadow-xs)",
  "transition-[border-color,background-color,box-shadow] duration-150",
  "hover:not-has-data-[state=checked]:border-(--dms-field-border-hover)",
  "has-data-[state=checked]:bg-(--dms-accent-tint) has-data-[state=checked]:shadow-[0_0_0_1px_var(--dms-accent-line)]",
].join(" ");

const CHOICE_CARD_LABEL = "font-semibold text-highlighted";

/** Group legends read as the mono eyebrow (`.check-group > legend`). */
const CHOICE_LEGEND =
  "mb-2.5 font-mono font-semibold uppercase tracking-[0.12em] text-dimmed";

/** Card padding, the accent border, the 12px gap and the disabled band. */
function CHOICE_CARD_COMPOUNDS(slot: "root" | "item") {
  return [
    { size: "md", variant: "card", class: { [slot]: "px-3.5 py-3" } },
    {
      color: "primary",
      variant: "card",
      class: { [slot]: "has-data-[state=checked]:border-primary" },
    },
    {
      variant: "card",
      disabled: true,
      class: {
        [slot]:
          "opacity-50 bg-(--dms-bg-muted) shadow-none hover:border-accented",
      },
    },
    {
      variant: "card",
      indicator: "start",
      class: { wrapper: "ms-3", description: "mt-[3px] leading-[1.45]" },
    },
    {
      variant: "card",
      indicator: "end",
      class: { wrapper: "me-3", description: "mt-[3px] leading-[1.45]" },
    },
  ];
}

/**
 * v2 checkbox: 16px box with a 4.5px radius on the field surface; checked is
 * the solid accent with dark ink and the fill highlight in both themes.
 */
export const checkboxTheme = {
  slots: {
    base: "rounded-[4.5px] ring-(--dms-border-top) bg-(--dms-bg-field)",
    label: "font-normal text-default",
    description: "text-[12.5px] text-muted",
  },
  variants: {
    color: {
      primary: {
        base: "outline-(--dms-accent-tint-strong)",
        indicator:
          "bg-(--dms-accent-fill) text-(--dms-accent-on-fill) shadow-(--dms-fill-highlight)",
      },
    },
    indicator: { start: { wrapper: "ms-2.5" }, end: { wrapper: "me-2.5" } },
    size: { md: { wrapper: "text-[13px]" } },
    disabled: { true: { root: "opacity-45" } },
    variant: { card: { root: CHOICE_CARD, label: CHOICE_CARD_LABEL } },
  },
  compoundVariants: CHOICE_CARD_COMPOUNDS("root"),
};

/** v2 radio: checked is a 5px accent ring around the field surface. */
export const radioGroupTheme = {
  slots: {
    legend: CHOICE_LEGEND,
    base: "ring-(--dms-border-top) bg-(--dms-bg-field)",
    indicator: "after:bg-(--dms-bg-field)",
    label: "font-normal text-default",
    description: "text-[12.5px] text-muted",
  },
  variants: {
    color: {
      primary: {
        base: "outline-(--dms-accent-tint-strong)",
        indicator: "bg-(--dms-accent-fill)",
      },
    },
    indicator: { start: { wrapper: "ms-2.5" }, end: { wrapper: "me-2.5" } },
    size: { md: { item: "text-[13px]", legend: "text-[10.5px]" } },
    disabled: { true: { item: "opacity-45" } },
    variant: { card: { item: CHOICE_CARD, label: CHOICE_CARD_LABEL } },
  },
  compoundVariants: [
    { orientation: "horizontal", class: { fieldset: "gap-x-4.5 gap-y-2" } },
    { orientation: "vertical", class: { fieldset: "gap-y-2" } },
    ...CHOICE_CARD_COMPOUNDS("item"),

    {
      orientation: "horizontal",
      variant: "card",
      class: {
        fieldset: "grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5",
      },
    },
    {
      orientation: "vertical",
      variant: "card",
      class: { fieldset: "gap-2.5" },
    },
  ],
};

/** Checkbox group: the radio spacing, and the card grid. */
export const checkboxGroupTheme = {
  slots: { legend: CHOICE_LEGEND },
  variants: { size: { md: { legend: "text-[10.5px]" } } },
  compoundVariants: [
    { orientation: "horizontal", class: { fieldset: "gap-x-4.5 gap-y-2" } },
    { orientation: "vertical", class: { fieldset: "gap-y-2" } },
    {
      orientation: "horizontal",
      variant: "card",
      class: {
        fieldset: "grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5",
      },
    },
    {
      orientation: "vertical",
      variant: "card",
      class: { fieldset: "gap-2.5" },
    },
  ],
};

/**
 * v2 switch: 32×18 track with a 14px knob (22/26/32/40/46px tracks across
 * the sizes); off is the strongest border in light and the accented one in
 * dark, on is the accent fill with a dark knob.
 */
export const switchTheme = {
  slots: {
    base: "data-[state=unchecked]:bg-(--dms-border-top) dark:data-[state=unchecked]:bg-(--ui-border-accented)",
    thumb: "bg-white shadow-sm data-[state=checked]:bg-(--dms-accent-on-fill)",
    wrapper: "ms-2.5",
    label: "font-normal text-default",
    description: "text-[12.5px] text-muted",
  },
  variants: {
    color: {
      primary: {
        base: "data-[state=checked]:bg-(--dms-accent-fill) outline-(--dms-accent-tint-strong)",
      },
    },
    size: {
      xs: {
        base: "w-[22px]",
        thumb:
          "size-2 data-[state=checked]:translate-x-2.5 data-[state=checked]:rtl:-translate-x-2.5",
      },
      sm: {
        base: "w-[26px]",
        thumb:
          "size-2.5 data-[state=checked]:translate-x-3 data-[state=checked]:rtl:-translate-x-3",
      },
      md: {
        base: "w-8",
        thumb:
          "size-3.5 data-[state=checked]:translate-x-3.5 data-[state=checked]:rtl:-translate-x-3.5",
        wrapper: "text-[13px]",
      },
      xl: {
        base: "w-[46px]",
        thumb:
          "size-5 data-[state=checked]:translate-x-5.5 data-[state=checked]:rtl:-translate-x-5.5",
      },
    },
    disabled: { true: { root: "opacity-45" } },

    loading: {
      true: {
        thumb: "bg-transparent shadow-none data-[state=checked]:bg-transparent",
        icon: "size-full text-white group-data-[state=checked]:text-(--dms-accent-on-fill)",
      },
    },
  },
  compoundVariants: [
    {
      loading: false,
      disabled: false,
      class: {
        base: "hover:data-[state=unchecked]:bg-(--dms-field-border-hover) dark:hover:data-[state=unchecked]:bg-(--dms-field-border-hover)",
      },
    },
    {
      color: "primary",
      loading: false,
      disabled: false,
      class: {
        base: "hover:data-[state=checked]:bg-(--dms-accent-fill-hover)",
      },
    },
    { loading: true, class: { root: "opacity-100", base: "cursor-progress" } },

    {
      color: "error",
      highlight: true,
      class: {
        base: "ring ring-error shadow-[0_0_0_4px_var(--dms-error-tint)]",
      },
    },
  ],
};
