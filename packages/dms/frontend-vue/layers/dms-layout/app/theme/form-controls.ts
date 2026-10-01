/**
 * Nuxt UI themes of the form controls (DMS design v2, mockup
 * components/input.html, select.html, checkbox.html and form.html), spread
 * into the app config `ui` key. Each entry extends the Nuxt UI default theme:
 * slot and variant classes are appended and tailwind-merged over it.
 *
 * Every class stays a literal string so Tailwind finds it when scanning.
 */

/**
 * v2 field surface: the recessed --dms-bg-field on a 1px accented border
 * with the xs shadow, a stronger border on hover and the muted band when
 * disabled. Select triggers repeat it so they never differ from a text input.
 */
const FIELD_OUTLINE = [
  "bg-(--dms-bg-field) ring-accented shadow-(--shadow-xs)",
  "hover:bg-(--dms-bg-field) hover:ring-(--dms-field-border-hover)",
  "disabled:bg-(--dms-bg-muted) disabled:shadow-none disabled:hover:ring-accented",
].join(" ");

/**
 * v2 `.input--soft` (dense filter bars): the hover tint, no border or
 * shadow, a stronger tint on hover. `.input--ghost` (inline editing):
 * transparent until hovered (inline editing, selects set in a sentence).
 * Soft goes back to the field surface with the accent border once focused
 * or open; ghost only shows the accent border on keyboard focus.
 */
const FIELD_SOFT = [
  "bg-elevated shadow-none hover:bg-accented/60 disabled:bg-elevated/60",
  "focus:bg-(--dms-bg-field) focus-visible:ring focus-visible:ring-inset",
  "data-[state=open]:bg-(--dms-bg-field) data-[state=open]:ring data-[state=open]:ring-inset",
].join(" ");

const FIELD_GHOST = [
  "bg-transparent shadow-none hover:bg-elevated disabled:bg-transparent",
  "focus-visible:ring focus-visible:ring-inset data-[state=open]:bg-elevated",
].join(" ");

/** Every text control and select trigger shares the three v2 field looks. */
const FIELD_VARIANTS = {
  outline: FIELD_OUTLINE,
  soft: FIELD_SOFT,
  ghost: FIELD_GHOST,
};

// Nuxt UI fades a disabled control to 75%, which still reads as enabled.
const FIELD_DISABLED = "disabled:opacity-50";

/**
 * Focus keeps Nuxt UI's accent border plus 3px outline, tinted with the v2
 * halo; an invalid field (UFormField sets color "error" and highlight) keeps
 * its error border on hover and gets the error halo.
 */
const FIELD_STATE_COMPOUNDS = [
  {
    color: "primary",
    variant: ["outline", "subtle", "soft", "ghost"],
    class: "outline-(--dms-accent-tint-strong)",
  },
  {
    color: "error",
    variant: ["outline", "subtle", "soft", "ghost"],
    class: "outline-(--dms-error-tint)",
  },
  // Soft and ghost fields draw their focus border in the field colour.
  {
    color: "primary",
    variant: ["soft", "ghost"],
    class: "focus-visible:ring-primary data-[state=open]:ring-primary",
  },
  {
    color: "error",
    variant: ["soft", "ghost"],
    class: "focus-visible:ring-error data-[state=open]:ring-error",
  },
  { color: "primary", highlight: true, class: "hover:ring-primary" },
  { color: "error", highlight: true, class: "hover:ring-error" },
];

/**
 * v2 field text: 12 / 12.5 / 13 / 14 / 15px for the 24 / 28 / 32 / 36 / 40px
 * heights, from the md breakpoint up. Below it Nuxt UI keeps 16px so iOS does
 * not zoom into a focused field; line heights stay, so heights do not move.
 */
const FIELD_TEXT_COMPOUNDS = [
  { fixed: false, size: "sm", class: "md:text-[12.5px]" },
  { fixed: false, size: "md", class: "md:text-[13px]" },
  { fixed: false, size: "xl", class: "md:text-[15px]" },
];

/** Room for a 16px icon plus the v2 8px gap after the side padding. */
const FIELD_ICON_PADDING_COMPOUNDS = [
  { leading: true, size: "sm", class: "ps-7.5" },
  { leading: true, size: "md", class: "ps-8.5" },
  { leading: true, size: "lg", class: "ps-9" },
  { leading: true, size: "xl", class: "ps-9.5" },
  { trailing: true, size: "sm", class: "pe-7.5" },
  { trailing: true, size: "md", class: "pe-8.5" },
  { trailing: true, size: "lg", class: "pe-9" },
  { trailing: true, size: "xl", class: "pe-9.5" },
];

const FIELD_SIZES = {
  sm: { base: "px-2", leading: "ps-2", trailing: "pe-2" },
  md: { leadingIcon: "size-4", trailingIcon: "size-4" },
  lg: { leadingIcon: "size-4", trailingIcon: "size-4" },
  xl: { leadingIcon: "size-4.5", trailingIcon: "size-4.5" },
};

const inputTheme = {
  slots: { base: FIELD_DISABLED },
  variants: { variant: FIELD_VARIANTS, size: FIELD_SIZES },
  compoundVariants: [
    ...FIELD_STATE_COMPOUNDS,
    ...FIELD_TEXT_COMPOUNDS,
    ...FIELD_ICON_PADDING_COMPOUNDS,
  ],
};

/** Select-like triggers: the input scale with explicit line heights. */
const SELECT_TRIGGER_SIZES = {
  sm: { base: "px-2 text-[12.5px]/4" },
  md: { base: "text-[13px]/5" },
  xl: { base: "text-[15px]/6" },
};

/**
 * v2 menu panel: card surface, accented hairline, 10px radius, pop shadow;
 * 30px items with a 6px hover tint, mono eyebrow group labels and the
 * selected check in the accent.
 */
const SELECT_MENU_SLOTS = {
  base: FIELD_DISABLED,
  content: "bg-default ring-accented rounded-lg shadow-(--shadow-lg)",
  label: "font-mono font-semibold uppercase tracking-[0.12em] text-dimmed",
  item: "text-toned before:rounded-[6px] data-highlighted:not-data-disabled:before:bg-elevated",
  itemTrailingIcon: "text-primary",
};

const SELECT_MENU_SIZES = {
  ...SELECT_TRIGGER_SIZES,
  md: {
    ...SELECT_TRIGGER_SIZES.md,
    label: "px-2 pt-2 pb-1 text-[10.5px]/4",
    item: "px-2 py-[5px] text-[13px]/5 gap-2",
    itemLeadingIcon: "size-4",
    itemLeadingChip: "size-4",
    itemTrailingIcon: "size-4",
    empty: "text-[13px]",
    leadingIcon: "size-4",
    trailingIcon: "size-4",
  },
};

const selectTheme = {
  slots: SELECT_MENU_SLOTS,
  variants: { variant: FIELD_VARIANTS, size: SELECT_MENU_SIZES },
  compoundVariants: [...FIELD_STATE_COMPOUNDS, ...FIELD_ICON_PADDING_COMPOUNDS],
};

/**
 * Number field: the compact v2 stepper, a bordered 24px column of carets
 * flush with the right edge, and tabular figures.
 */
const STEPPER_BUTTON =
  "[&>button]:size-full [&>button]:justify-center [&>button]:rounded-none [&>button]:p-0 [&>button]:text-muted [&>button]:hover:bg-elevated [&>button]:hover:text-highlighted [&>button_svg]:size-3";

const inputNumberTheme = {
  slots: { base: `${FIELD_DISABLED} tabular-nums` },
  variants: {
    variant: FIELD_VARIANTS,
    size: { sm: "px-2" },
    orientation: {
      vertical: {
        increment: `top-px end-px h-[calc(50%_-_1px)] w-6 pe-0 scale-100 overflow-hidden rounded-se-[7px] border-s border-b border-accented ${STEPPER_BUTTON}`,
        decrement: `bottom-px end-px h-[calc(50%_-_1px)] w-6 pe-0 scale-100 overflow-hidden rounded-ee-[7px] border-s border-accented ${STEPPER_BUTTON}`,
      },
    },
  },
  compoundVariants: [
    ...FIELD_STATE_COMPOUNDS,
    ...FIELD_TEXT_COMPOUNDS,
    { orientation: "vertical", increment: true, size: "sm", class: "pe-8" },
    { orientation: "vertical", increment: true, size: "md", class: "pe-8.5" },
    { orientation: "vertical", increment: true, size: "lg", class: "pe-9" },
    // Borderless fields drop the stepper hairlines too.
    {
      variant: ["soft", "ghost"],
      orientation: "vertical",
      class: {
        increment: "border-transparent",
        decrement: "border-transparent",
      },
    },
  ],
};

/** v2 tags: 22px chips on the pressed tint, with a small ghost delete. */
const inputTagsTheme = {
  slots: {
    base: FIELD_DISABLED,
    item: "h-[22px] rounded-[6px] ring-0 bg-accented text-toned font-medium ps-2 pe-1",
    itemDelete: "rounded-[4px]",
  },
  variants: {
    variant: FIELD_VARIANTS,
    size: { md: { item: "text-xs", itemDeleteIcon: "size-3" } },
  },
  compoundVariants: [...FIELD_STATE_COMPOUNDS, ...FIELD_TEXT_COMPOUNDS],
};

/**
 * v2 choice card (`.check-card`, `variant="card"` on UCheckbox,
 * UCheckboxGroup and URadioGroup): a bordered card tile, the whole tile is
 * the hit area; selected = accent border, accent-line halo and the tint;
 * disabled = muted band at half opacity. Put an icon well in the label slot.
 */
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
const checkboxTheme = {
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
const radioGroupTheme = {
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
    // Card tiles flow in a grid of 180px minimum columns (.check-cards).
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
const checkboxGroupTheme = {
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
const switchTheme = {
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
    // The knob turns into a spinner ring; a busy switch is not faded.
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
    // Invalid (UFormField error): error hairline plus the error halo.
    {
      color: "error",
      highlight: true,
      class: {
        base: "ring ring-error shadow-[0_0_0_4px_var(--dms-error-tint)]",
      },
    },
  ],
};

/**
 * v2 code cells (`.au-otp`, `.cs-otp`): mono semibold digits on the field
 * surface, accent border plus halo on focus. Cells 28x32, 32x36, 38x44,
 * 42x48 and 46x52 (the sign-in code); `xl` also widens the gap.
 */
const PIN_FIELD =
  "bg-(--dms-bg-field) ring-accented shadow-(--shadow-xs) hover:ring-(--dms-field-border-hover)";

const pinInputTheme = {
  slots: {
    root: "gap-1.5",
    base: "font-mono font-semibold text-highlighted tabular-nums rounded-lg disabled:opacity-50",
  },
  variants: {
    variant: {
      outline: PIN_FIELD,
      soft: "bg-elevated hover:bg-accented/60 focus:bg-(--dms-bg-field)",
      ghost: "hover:bg-elevated focus:bg-(--dms-bg-field)",
    },
    size: {
      xs: { base: "h-8 w-7 text-[13px]/4" },
      sm: { base: "h-9 w-8 text-[15px]/5" },
      md: { base: "h-11 w-[38px] text-lg/6" },
      lg: { base: "h-12 w-[42px] text-xl/6" },
      xl: {
        base: "h-[52px] w-[46px] rounded-[10px] text-[22px]/7 max-sm:h-[46px] max-sm:w-[38px]",
      },
    },
  },
  compoundVariants: [
    {
      color: "primary",
      variant: ["outline", "subtle", "soft", "ghost"],
      class: "outline-(--dms-accent-tint-strong)",
    },
    {
      color: "error",
      variant: ["outline", "subtle", "soft", "ghost"],
      class: "outline-(--dms-error-tint)",
    },
    { color: "primary", highlight: true, class: "hover:ring-primary" },
    { color: "error", highlight: true, class: "hover:ring-error" },
    { fixed: false, size: "xs", class: "md:text-[13px]" },
    { fixed: false, size: "sm", class: "md:text-[15px]" },
    { fixed: false, size: "md", class: "md:text-lg" },
    { fixed: false, size: "lg", class: "md:text-xl" },
    { fixed: false, size: "xl", class: "md:text-[22px]" },
    { size: "xl", class: { root: "gap-2 max-sm:gap-[5px]" } },
  ],
};

/**
 * Date field: the text-field looks with mono tabular segments; the focused
 * segment takes the accent tint. Nuxt UI turns `focus:` into `has-focus:`
 * on this root (a div around the segments), so the soft and ghost focus
 * states are spelled out here.
 */
const inputDateTheme = {
  slots: {
    base: "tabular-nums data-disabled:opacity-50",
    segment:
      "rounded-[4px] font-mono focus:bg-(--dms-accent-tint-strong) focus:text-highlighted data-[segment=literal]:text-dimmed",
  },
  variants: {
    variant: {
      outline: FIELD_OUTLINE,
      soft: "bg-elevated shadow-none hover:bg-accented/60 has-focus:bg-(--dms-bg-field) has-focus-visible:ring has-focus-visible:ring-inset",
      ghost:
        "bg-transparent shadow-none hover:bg-elevated has-focus-visible:ring has-focus-visible:ring-inset",
    },
    size: FIELD_SIZES,
  },
  compoundVariants: [
    {
      color: "primary",
      variant: ["outline", "subtle", "soft", "ghost"],
      class: "outline-(--dms-accent-tint-strong)",
    },
    {
      color: "error",
      variant: ["outline", "subtle", "soft", "ghost"],
      class: "outline-(--dms-error-tint)",
    },
    {
      color: "primary",
      variant: ["soft", "ghost"],
      class: "has-focus-visible:ring-primary",
    },
    {
      color: "error",
      variant: ["soft", "ghost"],
      class: "has-focus-visible:ring-error",
    },
    { color: "primary", highlight: true, class: "hover:ring-primary" },
    { color: "error", highlight: true, class: "hover:ring-error" },
    ...FIELD_TEXT_COMPOUNDS,
    {
      variant: ["outline", "soft", "subtle", "ghost", "none"],
      class: {
        segment:
          "focus:bg-(--dms-accent-tint-strong) group-hover:focus:bg-(--dms-accent-tint-strong)",
      },
    },
  ],
};

/**
 * v2 field chrome: 13px/550 label in ink, 12.5px muted description and help,
 * the "Optional" hint in mono and a 12.5px error line. Form.vue fills the
 * error slot with the warning icon; the slot renders even without an error,
 * hence empty:hidden.
 */
const formFieldTheme = {
  slots: {
    label: "text-[13px] font-[550] text-highlighted",
    description: "text-[12.5px] text-muted",
    hint: "font-mono text-[11px] font-medium text-dimmed",
    error:
      "mt-1.5 flex items-center gap-1.5 text-[12.5px] text-error empty:hidden",
    help: "mt-1.5 text-[12.5px] text-muted",
  },
  variants: { orientation: { vertical: { container: "mt-1.5" } } },
};

/** v2 slider: 6px track on the pressed tint, accent-fill range and ring. */
const sliderTheme = {
  slots: { thumb: "bg-default shadow-sm" },
  variants: {
    color: {
      primary: {
        range: "bg-(--dms-accent-fill)",
        thumb: "ring-(--dms-accent-fill) outline-(--dms-accent-tint-strong)",
      },
    },
  },
  compoundVariants: [
    { orientation: "horizontal", size: "md", class: { track: "h-1.5" } },
  ],
};

/**
 * v2 calendar: mono day cells with a 7px radius, the accent hairline on
 * today and the solid accent fill on the selected day.
 */
const calendarTheme = {
  slots: {
    headingLabel: "font-semibold text-highlighted",
    cellTrigger: "font-mono font-medium",
  },
  variants: {
    color: {
      primary: {
        headCell:
          "font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-dimmed",
      },
    },
    view: {
      day: { cellTrigger: "rounded-[7px] data-outside-view:text-dimmed" },
    },
    size: { md: { cell: "text-xs", headingLabel: "text-[13px]" } },
  },
  compoundVariants: [
    {
      color: "primary",
      variant: "solid",
      class: {
        cellTrigger:
          "text-toned data-selected:bg-(--dms-accent-fill) data-selected:text-(--dms-accent-on-fill) data-selected:font-bold data-selected:shadow-(--dms-fill-highlight) data-today:not-data-selected:text-primary data-today:not-data-selected:ring data-today:not-data-selected:ring-inset data-today:not-data-selected:ring-(--dms-accent-line) data-highlighted:bg-(--dms-accent-tint-strong) hover:not-data-selected:bg-elevated",
      },
    },
  ],
};

/**
 * v2 dropzone: dashed strongest border on the field surface, 10px radius;
 * dragging turns it into a solid accent border on the accent tint.
 */
const fileUploadTheme = {
  slots: {
    base: "bg-(--dms-bg-field) border-(--dms-border-top) rounded-lg hover:bg-elevated/40",
    label: "font-semibold text-highlighted",
    description: "font-mono text-[11.5px] text-dimmed",
    file: "bg-default",
  },
  variants: {
    dropzone: {
      true: "data-[dragging=true]:border-solid data-[dragging=true]:border-primary data-[dragging=true]:bg-(--dms-accent-tint) data-[dragging=true]:shadow-[0_0_0_6px_var(--dms-accent-tint)]",
    },
    layout: { list: { file: "border-default rounded-md" } },
  },
  compoundVariants: [
    { color: "primary", class: "outline-(--dms-accent-tint-strong)" },
  ],
};

export const formControlsTheme = {
  input: inputTheme,
  textarea: {
    ...inputTheme,
    variants: {
      ...inputTheme.variants,
      size: { ...FIELD_SIZES, md: { ...FIELD_SIZES.md, base: "py-2" } },
    },
  },
  inputMenu: inputTheme,
  inputNumber: inputNumberTheme,
  inputTags: inputTagsTheme,
  inputDate: inputDateTheme,
  pinInput: pinInputTheme,
  select: selectTheme,
  selectMenu: {
    ...selectTheme,
    slots: {
      ...SELECT_MENU_SLOTS,
      input: "border-b border-default [&_input]:h-9",
    },
  },
  checkbox: checkboxTheme,
  radioGroup: radioGroupTheme,
  checkboxGroup: checkboxGroupTheme,
  switch: switchTheme,
  formField: formFieldTheme,
  slider: sliderTheme,
  calendar: calendarTheme,
  fileUpload: fileUploadTheme,
};
