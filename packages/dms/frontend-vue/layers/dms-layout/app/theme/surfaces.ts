/**
 * Nuxt UI themes of the surfaces and feedback primitives (DMS design v2,
 * mockup components/card.html, menu.html, modal.html, toast.html and
 * banner.html), spread into the app config `ui` key. Each entry extends the
 * Nuxt UI default theme: slot and variant classes are appended and
 * tailwind-merged over it, and compound variants run after the defaults.
 *
 * Every class stays a literal string so Tailwind finds it when scanning.
 */

import { EYEBROW_CLASS } from "#dms-ui/app/build/utils/eyebrow";

/** Floating panels (menus, popovers, toasts): accented hairline and the pop shadow. */
const FLOATING_SURFACE =
  "bg-default ring-accented shadow-(--dms-shadow-pop) rounded-[10px]";

/** Topmost overlays: the brightest border and the modal shadow. */
const OVERLAY_SURFACE =
  "bg-default ring-(--dms-border-top) shadow-(--dms-shadow-modal)";

const BACKDROP = "bg-(--dms-overlay) backdrop-blur-[2px]";

const cardTheme = {
  slots: {
    // 48px head carrying the mono eyebrow title, 18px body, muted footer band.
    header:
      "flex items-center gap-2.5 min-h-12 py-2 ps-[18px] pe-4 sm:ps-[18px] sm:pe-4",
    title: `${EYEBROW_CLASS} text-muted`,
    description: "mt-0.5 text-[13px]",
    body: "p-[18px] sm:p-5",
    footer: "flex items-center gap-2 px-4 py-2.5 sm:px-4 bg-(--dms-bg-muted)",
  },
  variants: {
    variant: {
      // The shared .dms-card surface: 14px radius, hairline border, card shadow.
      outline: {
        root: "rounded-(--dms-radius-card) bg-(--dms-surface-card) ring ring-default shadow-(--dms-shadow-card)",
      },
    },
  },
};

/** Menu rows: 30px, 13px labels, 16px icons, 6px hover box. */
const MENU_MD_SIZE = {
  label: `${EYEBROW_CLASS} text-dimmed px-2 pt-2 pb-1`,
  item: "px-2 py-[5px] text-[13px]/5 gap-[9px] before:rounded-[6px]",
  empty: "p-2.5 text-[13px]",
  itemLeadingIcon: "size-4 my-0.5",
  itemTrailingIcon: "size-4 my-0.5",
  itemTrailingKbdsSize: "sm",
};

const menuTheme = {
  slots: {
    content: `min-w-48 ${FLOATING_SURFACE}`,
    separator: "-mx-1 my-1 bg-(--ui-border)",
    itemTrailing: "text-dimmed",
    itemTrailingIcon: "group-data-[state=checked]:text-primary",
  },
  variants: {
    active: {
      false: {
        item: "data-highlighted:before:bg-elevated data-[state=open]:before:bg-elevated",
        itemLeadingIcon:
          "text-muted group-data-highlighted:text-highlighted group-data-[state=open]:text-highlighted",
      },
    },
    size: {
      md: MENU_MD_SIZE,
    },
  },
};

const popoverTheme = {
  slots: {
    content: FLOATING_SURFACE,
    arrow: "stroke-(--ui-border-accented)",
  },
};

const tooltipTheme = {
  slots: {
    // Inverted chip; its keycaps drop their surface and follow the ink.
    content:
      "bg-inverted text-inverted ring-0 rounded-[6px] h-auto min-h-6 px-2 py-1 text-xs font-medium shadow-(--dms-shadow-pop)",
    arrow: "fill-(--ui-bg-inverted) stroke-(--ui-bg-inverted)",
    kbds: "opacity-70 *:bg-transparent *:text-current *:ring-current/40 *:shadow-none",
  },
};

const modalTheme = {
  slots: {
    content: "bg-default divide-y-0",
    header: "items-start gap-3 min-h-0 px-5 pt-[18px] pb-0 sm:px-5",
    title: "text-[17px] leading-[1.3] font-[650] tracking-[-0.02em]",
    description: "mt-1 text-[13px]",
    body: "px-5 pt-4 pb-5 sm:px-5 sm:pt-4 sm:pb-5",
    footer:
      "justify-end gap-2 px-5 py-3 sm:px-5 border-t border-default bg-(--dms-bg-muted)",
    close: "top-3.5 end-4",
  },
  variants: {
    fullscreen: {
      false: {
        content: `rounded-[16px] ${OVERLAY_SURFACE}`,
      },
    },
    overlay: {
      true: {
        overlay: BACKDROP,
      },
    },
  },
};

const slideoverTheme = {
  slots: {
    overlay: BACKDROP,
    content: `${OVERLAY_SURFACE} sm:shadow-(--dms-shadow-modal)`,
    header: "px-5 sm:px-5",
    title: "text-[17px] leading-[1.3] font-[650] tracking-[-0.02em]",
    description: "text-[13px]",
    body: "p-5 sm:p-5",
    footer: "justify-end gap-2 px-5 py-3 sm:px-5 bg-(--dms-bg-muted)",
  },
};

/** Drawers read as the topmost surface: 16px corners on the open edge. */
const DRAWER_EDGE_COMPOUNDS = [
  { direction: "top", inset: false, class: { content: "rounded-b-[16px]" } },
  { direction: "bottom", inset: false, class: { content: "rounded-t-[16px]" } },
  { direction: "left", inset: false, class: { content: "rounded-r-[16px]" } },
  { direction: "right", inset: false, class: { content: "rounded-l-[16px]" } },
  { inset: true, class: { content: "rounded-[16px]" } },
  { direction: ["top", "bottom"], class: { handle: "!w-10 !h-1" } },
];

const drawerTheme = {
  slots: {
    overlay: BACKDROP,
    content: OVERLAY_SURFACE,
  },
  compoundVariants: DRAWER_EDGE_COMPOUNDS,
};

/**
 * v2 toast (mockup components/toast.html): elevated card, coloured icon on a
 * neutral surface, actions under the text, a ghost close in the corner and a
 * 2px duration bar along the bottom edge.
 */
const toastTheme = {
  slots: {
    root: "rounded-(--dms-radius-card) bg-default ring-accented shadow-(--dms-shadow-pop) p-3.5 ps-4 gap-3",
    title: "text-[13px]/[1.35] font-semibold",
    description: "text-[13px]/[1.45]",
    icon: "size-[18px] mt-px",
    actions: "gap-1.5",
    // Ghost xs square button (design .toast__close), pulled into the corner.
    close:
      "-mt-1 -me-1.5 p-1 rounded-md text-dimmed hover:text-highlighted hover:bg-elevated [&_[data-slot=leadingIcon]]:size-4",
    // 2px duration bar on the muted hairline (design .toast__timer).
    progress:
      "[&_[data-slot=base]]:h-0.5 [&_[data-slot=base]]:rounded-none [&_[data-slot=base]]:bg-(--ui-border-muted) [&_[data-slot=indicator]]:rounded-none",
  },
  variants: {
    title: {
      true: { description: "mt-0.5" },
    },
    orientation: {
      vertical: { actions: "mt-2.5" },
    },
  },
};

/**
 * v2 toaster: 380px stack 20px off the corner, collapsed behind the newest
 * toast until hovered (the `expand` default below is read as a prop default).
 * New toasts rise 16px into place instead of sliding in from a full toast
 * height below: that slide started off-screen, so a toast whose animation
 * had not run yet (background tab, throttled frame) sat cut off under the
 * bottom edge.
 */
const toasterTheme = {
  slots: {
    viewport: "w-[calc(100%-2.5rem)] sm:w-[380px]",
  },
  variants: {
    position: {
      "top-left": { viewport: "left-5" },
      "top-right": { viewport: "right-5" },
      "bottom-left": { viewport: "left-5" },
      "bottom-right": { viewport: "right-5" },
    },
  },
  compoundVariants: [
    {
      position: ["top-left", "top-center", "top-right"],
      class: {
        viewport: "top-5",
        base: "data-[state=open]:animate-none starting:-translate-y-4",
      },
    },
    {
      position: ["bottom-left", "bottom-center", "bottom-right"],
      class: {
        viewport: "bottom-5",
        base: "data-[state=open]:animate-none starting:translate-y-4",
      },
    },
  ],
  defaultVariants: {
    expand: false,
  },
};

const alertTheme = {
  slots: {
    root: "rounded-[10px] px-3.5 py-3 gap-3",
    title: "text-[13px] font-semibold",
    description: "text-[13px] opacity-100",
    icon: "size-[18px]",
  },
  variants: {
    title: {
      true: { description: "mt-0.5" },
    },
  },
  compoundVariants: [
    // Tinted alerts: only the icon (and the tint) carries the colour.
    {
      variant: ["soft", "subtle", "outline"],
      class: { title: "text-highlighted", description: "text-muted" },
    },
    {
      color: "primary",
      variant: "solid",
      class: { root: "bg-(--dms-accent-fill) text-(--dms-accent-on-fill)" },
    },
  ],
  defaultVariants: {
    variant: "subtle",
  },
};

const avatarTheme = {
  variants: {
    color: {
      // The default initials avatar: the brand gradient with mono dark ink.
      neutral: {
        root: "bg-linear-135 from-(--ui-color-primary-400) to-(--ui-color-secondary-400)",
        fallback: "font-mono font-bold text-(--dms-accent-on-fill)",
        icon: "text-(--dms-accent-on-fill)",
      },
    },
    size: {
      "3xs": { root: "text-[7px]" },
      "2xs": { root: "text-[8px]" },
      xs: { root: "text-[9px]" },
      sm: { root: "text-[11px]" },
      md: { root: "text-xs" },
      lg: { root: "text-[13px]" },
      xl: { root: "text-sm" },
      "2xl": { root: "text-base" },
      "3xl": { root: "text-lg" },
    },
  },
};

const skeletonTheme = {
  base: "bg-(--dms-skeleton) rounded-[6px]",
};

const progressTheme = {
  slots: {
    base: "bg-accented",
    step: "text-xs",
  },
  variants: {
    color: {
      primary: { indicator: "bg-(--dms-accent-fill)" },
    },
    step: {
      active: { step: "text-primary font-semibold" },
    },
  },
  compoundVariants: [
    { orientation: "horizontal", size: "md", class: "h-1.5" },
    { orientation: "horizontal", size: "lg", class: "h-2" },
    { orientation: "vertical", size: "md", class: "w-1.5" },
    { orientation: "vertical", size: "lg", class: "w-2" },
  ],
};

const accordionTheme = {
  slots: {
    trigger: "text-[13px] font-semibold text-highlighted py-3",
    body: "text-[13px] text-muted pb-3",
    trailingIcon: "size-4 text-dimmed",
  },
};

/** Surface and feedback primitive themes, spread into `ui` of the app config. */
export const surfacesTheme = {
  card: cardTheme,
  dropdownMenu: menuTheme,
  contextMenu: menuTheme,
  popover: popoverTheme,
  tooltip: tooltipTheme,
  modal: modalTheme,
  slideover: slideoverTheme,
  drawer: drawerTheme,
  toast: toastTheme,
  toaster: toasterTheme,
  alert: alertTheme,
  avatar: avatarTheme,
  skeleton: skeletonTheme,
  progress: progressTheme,
  accordion: accordionTheme,
};
