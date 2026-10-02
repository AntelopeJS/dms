/**
 * Nuxt UI themes of the action and label primitives (DMS design v2, mockup
 * components/button.html, badge.html, kbd.html and tabs.html), spread into
 * the app config `ui` key. Each entry extends the Nuxt UI default theme: slot
 * and variant classes are appended and tailwind-merged over it, and compound
 * variants run after the defaults, so they win over them.
 *
 * Every class stays a literal string so Tailwind finds it when scanning.
 */

/** Semantic fills that are not the accent: bright steps with dark ink, as the accent fill. */
const SOLID_FILL_COMPOUNDS = [
  {
    color: "secondary",
    variant: "solid",
    class:
      "bg-(--ui-color-secondary-400) text-(--ui-color-secondary-950) hover:bg-(--ui-color-secondary-300) active:bg-(--ui-color-secondary-300) disabled:bg-(--ui-color-secondary-400) aria-disabled:bg-(--ui-color-secondary-400)",
  },
  {
    color: "success",
    variant: "solid",
    class:
      "bg-(--ui-color-success-500) text-(--ui-color-success-950) hover:bg-(--ui-color-success-400) active:bg-(--ui-color-success-400) disabled:bg-(--ui-color-success-500) aria-disabled:bg-(--ui-color-success-500)",
  },
  {
    color: "info",
    variant: "solid",
    class:
      "bg-(--ui-color-info-400) text-(--ui-color-info-950) hover:bg-(--ui-color-info-300) active:bg-(--ui-color-info-300) disabled:bg-(--ui-color-info-400) aria-disabled:bg-(--ui-color-info-400)",
  },
  {
    color: "warning",
    variant: "solid",
    class:
      "bg-(--ui-color-warning-400) text-(--ui-color-warning-950) hover:bg-(--ui-color-warning-300) active:bg-(--ui-color-warning-300) disabled:bg-(--ui-color-warning-400) aria-disabled:bg-(--ui-color-warning-400)",
  },
  // White ink on the 500 step in both themes; Nuxt UI would put dark ink on
  // the lighter dark-theme step.
  {
    color: "error",
    variant: "solid",
    class:
      "bg-(--ui-color-error-500) text-white hover:bg-(--ui-color-error-400) active:bg-(--ui-color-error-400) disabled:bg-(--ui-color-error-500) aria-disabled:bg-(--ui-color-error-500)",
  },
];

const FILLED_VARIANTS = ["solid", "outline", "soft", "subtle", "ghost"];

/** Icon-only buttons are exact squares of the control height. */
const BUTTON_SQUARE_COMPOUNDS = [
  {
    size: "xs",
    square: true,
    variant: FILLED_VARIANTS,
    class: "w-6 p-0 justify-center",
  },
  {
    size: "sm",
    square: true,
    variant: FILLED_VARIANTS,
    class: "w-7 p-0 justify-center",
  },
  {
    size: "md",
    square: true,
    variant: FILLED_VARIANTS,
    class: "w-8 p-0 justify-center",
  },
  {
    size: "lg",
    square: true,
    variant: FILLED_VARIANTS,
    class: "w-9 p-0 justify-center",
  },
  {
    size: "xl",
    square: true,
    variant: FILLED_VARIANTS,
    class: "w-10 p-0 justify-center",
  },
];

const buttonTheme = {
  slots: {
    // Tactile press + full transition (design .btn active:scale(.98)).
    // Nuxt UI only fades a disabled button to 75%, which still reads as
    // enabled on a filled primary: fade it further and drop the press and
    // the inset highlight so every variant looks inert.
    base: [
      "font-[550] transition active:scale-[0.98]",
      "disabled:opacity-50 aria-disabled:opacity-50",
      "disabled:active:scale-100 aria-disabled:active:scale-100",
      "disabled:shadow-none aria-disabled:shadow-none",
    ].join(" "),
  },
  variants: {
    // v2 control heights 24/28/32/36/40 px, shared with inputs and tabs.
    size: {
      xs: {
        base: "h-6 px-2 py-0 text-xs gap-1 rounded-[6px]",
        leadingIcon: "size-3.5",
        trailingIcon: "size-3.5",
      },
      sm: {
        base: "h-7 px-2.5 py-0 text-[12.5px] gap-1.5",
        leadingIcon: "size-[15px]",
        trailingIcon: "size-[15px]",
      },
      md: {
        base: "h-8 px-3 py-0 text-[13px] gap-1.5",
        leadingIcon: "size-4",
        trailingIcon: "size-4",
      },
      lg: {
        base: "h-9 px-3.5 py-0 text-sm gap-1.5",
        leadingIcon: "size-[17px]",
        trailingIcon: "size-[17px]",
      },
      xl: {
        base: "h-10 px-4 py-0 text-[15px] gap-2 rounded-[10px]",
        leadingIcon: "size-[18px]",
        trailingIcon: "size-[18px]",
      },
    },
  },
  compoundVariants: [
    // v2 solid accent: the bright fill with dark ink in both themes, the
    // text accent (--ui-primary) being too deep for a fill in light, plus
    // the inset top highlight.
    {
      color: "primary",
      variant: "solid",
      class:
        "bg-(--dms-accent-fill) text-(--dms-accent-on-fill) hover:bg-(--dms-accent-fill-hover) active:bg-(--dms-accent-fill-hover) disabled:bg-(--dms-accent-fill) aria-disabled:bg-(--dms-accent-fill) shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)]",
    },
    ...SOLID_FILL_COMPOUNDS,
    // The dashboard's workhorse "secondary" button (design .btn--secondary):
    // card surface, accented border, ink text and the xs drop shadow.
    {
      color: "neutral",
      variant: "outline",
      class:
        "bg-default text-highlighted ring-accented shadow-(--shadow-xs) hover:bg-elevated active:bg-elevated data-[state=open]:bg-elevated",
    },
    {
      color: "neutral",
      variant: "soft",
      class:
        "text-highlighted hover:bg-accented active:bg-accented data-[state=open]:bg-accented",
    },
    // Menu and popover triggers keep their hover tint while open.
    {
      color: "neutral",
      variant: "ghost",
      class:
        "hover:text-highlighted data-[state=open]:bg-elevated data-[state=open]:text-highlighted",
    },
    ...BUTTON_SQUARE_COMPOUNDS,
    // v2 .btn--link: no box at all, the underline fades in on hover.
    {
      variant: "link",
      class:
        "h-auto p-0 underline decoration-transparent underline-offset-[3px] hover:decoration-current",
    },
  ],
};

/** v2 badges: pill heights 16/18/22/26/28 px, semibold 10-13 px labels. */
const BADGE_SIZES = {
  xs: {
    base: "h-4 px-1.5 py-0 text-[10px] gap-1 rounded-full",
    leadingIcon: "size-[11px]",
    trailingIcon: "size-[11px]",
  },
  sm: {
    base: "h-[18px] px-1.5 py-0 text-[10.5px] gap-1 rounded-full",
    leadingIcon: "size-3",
    trailingIcon: "size-3",
  },
  md: {
    base: "h-[22px] px-2 py-0 text-[11.5px] gap-[5px] rounded-full",
    leadingIcon: "size-[13px]",
    trailingIcon: "size-[13px]",
  },
  lg: {
    base: "h-[26px] px-2.5 py-0 text-[12.5px] gap-1.5 rounded-full",
    leadingIcon: "size-3.5",
    trailingIcon: "size-3.5",
  },
  xl: {
    base: "h-7 px-3 py-0 text-[13px] gap-1.5 rounded-full",
    leadingIcon: "size-[15px]",
    trailingIcon: "size-[15px]",
  },
};

/**
 * `square` is the 5px-radius chip (counts, mono tags), keeping the size
 * padding instead of Nuxt UI's padding-only square.
 */
const BADGE_SQUARE_COMPOUNDS = [
  { size: "xs", square: true, class: "px-1 py-0 rounded-[4px]" },
  { size: "sm", square: true, class: "px-1.5 py-0 rounded-[5px]" },
  { size: "md", square: true, class: "px-2 py-0 rounded-[5px]" },
  { size: "lg", square: true, class: "px-2.5 py-0 rounded-[5px]" },
  { size: "xl", square: true, class: "px-3 py-0 rounded-[6px]" },
];

const badgeTheme = {
  slots: {
    base: "font-semibold leading-none whitespace-nowrap",
  },
  variants: {
    size: BADGE_SIZES,
  },
  compoundVariants: [
    {
      color: "primary",
      variant: "solid",
      class: "bg-(--dms-accent-fill) text-(--dms-accent-on-fill)",
    },
    ...SOLID_FILL_COMPOUNDS,
    ...BADGE_SQUARE_COMPOUNDS,
  ],
  // The v2 badge is the flat 10% tint; subtle adds the tinted border.
  defaultVariants: {
    variant: "soft",
  },
};

const kbdTheme = {
  // <UKbd> is a single-element component (no slots): base/variants live at
  // the root of its theme.
  base: "font-mono font-[550] tracking-[0.02em] rounded-[5px]",
  variants: {
    size: {
      sm: "h-[17px] min-w-[17px] px-1 text-[10px]",
      md: "h-5 min-w-5 px-[5px] text-[11px]",
      lg: "h-7 min-w-[30px] px-2 text-xs rounded-[7px]",
    },
  },
  compoundVariants: [
    // The keycap: a card-surface key with a 2px bottom edge.
    {
      color: "neutral",
      variant: "outline",
      class:
        "bg-default text-muted ring-accented shadow-[inset_0_-1px_0_var(--ui-border-accented)]",
    },
    { color: "neutral", variant: "soft", class: "bg-accented text-toned" },
  ],
};

/** Pill tabs track the button heights: 24/28/32/36/40 px lists. */
const TABS_SIZES = {
  xs: {
    trigger: "h-[18px] px-2 py-0 text-[11.5px] gap-1",
    leadingIcon: "size-3.5",
  },
  sm: {
    trigger: "h-[22px] px-2 py-0 text-xs gap-1.5",
    leadingIcon: "size-3.5",
  },
  md: {
    trigger: "h-[26px] px-2.5 py-0 text-[13px] gap-1.5",
    leadingIcon: "size-[15px]",
  },
  lg: {
    trigger: "h-[30px] px-3 py-0 text-[13.5px] gap-2",
    leadingIcon: "size-4",
  },
  xl: {
    trigger: "h-[34px] px-3.5 py-0 text-sm gap-2",
    leadingIcon: "size-[17px]",
  },
};

// Nuxt UI paints the active trigger through an "in-[list without
// indicator]" selector until the indicator exists (server render); the
// overrides repeat it verbatim so tailwind-merge replaces the default fill.
const TABS_PILL_COMPOUNDS = [
  {
    color: "neutral",
    variant: "pill",
    class: {
      indicator: "bg-default",
      trigger:
        "data-[state=active]:text-highlighted in-[[data-slot=list]:not(:has([data-slot=indicator]))]:data-[state=active]:before:bg-default",
    },
  },
  {
    color: "primary",
    variant: "pill",
    class: {
      indicator:
        "bg-(--dms-accent-tint-strong) ring-(--dms-accent-line) shadow-none",
      trigger:
        "data-[state=active]:text-primary in-[[data-slot=list]:not(:has([data-slot=indicator]))]:data-[state=active]:before:bg-(--dms-accent-tint-strong)",
    },
  },
];

/** Link tabs: 32/38/44 px rows with a 2px accent underline, ink label. */
const TABS_LINK_COMPOUNDS = [
  {
    variant: "link",
    class: {
      list: "p-0 gap-[18px]",
      trigger: "px-0.5 rounded-none",
    },
  },
  {
    variant: "link",
    orientation: "horizontal",
    class: { indicator: "h-0.5 rounded-t-[2px] rounded-b-none" },
  },
  { variant: "link", size: ["xs", "sm"], class: { trigger: "h-8" } },
  { variant: "link", size: "md", class: { trigger: "h-[38px]" } },
  { variant: "link", size: ["lg", "xl"], class: { trigger: "h-11" } },
  // Every colour keeps the ink label; only the underline takes the colour.
  {
    color: ["primary", "secondary", "success", "info", "warning", "error"],
    variant: "link",
    class: { trigger: "data-[state=active]:text-highlighted" },
  },
];

const tabsTheme = {
  slots: {
    trigger: "data-[state=active]:font-semibold",
    // Counts as mono chips, tinted with the accent on the active tab.
    trailingBadge:
      "font-mono text-[10.5px] h-4 px-[5px] rounded-[4px] ring-0 bg-elevated text-dimmed group-data-[state=active]:bg-(--dms-accent-tint) group-data-[state=active]:text-primary",
  },
  variants: {
    variant: {
      pill: {
        list: "bg-(--dms-bg-muted) ring ring-inset ring-default p-[3px] gap-0.5 rounded-[10px]",
        indicator: "ring ring-accented shadow-(--shadow-sm) rounded-[7px]",
        trigger: "rounded-[7px] before:rounded-[7px]",
      },
    },
    // A vertical list sits at the top of its panel, not centred beside it.
    orientation: {
      vertical: { root: "items-start" },
    },
    size: TABS_SIZES,
  },
  compoundVariants: [
    {
      orientation: "horizontal",
      variant: "pill",
      class: { indicator: "inset-y-[3px]" },
    },
    ...TABS_PILL_COMPOUNDS,
    ...TABS_LINK_COMPOUNDS,
  ],
};

/** Action and label primitive themes, spread into `ui` of the app config. */
export const actionsTheme = {
  button: buttonTheme,
  badge: badgeTheme,
  kbd: kbdTheme,
  tabs: tabsTheme,
};
