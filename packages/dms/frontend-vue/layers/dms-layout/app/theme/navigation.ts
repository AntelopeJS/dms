/**
 * Nuxt UI themes of the navigation primitives (DMS design v2, mockup
 * components/navigation.html, onboarding/*.html step indicator and
 * settings/security.html setup steps), spread into the app config `ui` key.
 * Each entry extends the Nuxt UI default theme: slot and variant classes are
 * appended and tailwind-merged over it, and compound variants run after the
 * defaults, so they win over them.
 *
 * Every class stays a literal string so Tailwind finds it when scanning.
 */

/**
 * v2 stepper. Horizontal is the onboarding `.au-steps` row: the label sits
 * beside its dot and a 28px hairline joins the steps (the container is
 * flattened so the separator follows the label). Vertical is the security
 * `.cs-step` list: dot column, 13px/600 title, 12.5px muted description.
 * States: done = accent fill (pass a check `icon`), current = accent ring on
 * the tint, upcoming = hairline. Sizes: `xs` is the dot style (no number),
 * `sm` the 22px onboarding dot, `md` the 24px setup dot, then 28 / 32px.
 */
const stepperTheme = {
  slots: {
    trigger:
      "border border-accented bg-default font-mono font-[650] text-muted transition-[background-color,border-color,box-shadow,color] duration-150",
    icon: "shrink-0",
    // Steps the linear stepper cannot reach yet stay crisp: the upcoming
    // look already reads as inactive.
    separator: "rounded-none group-data-[disabled]:opacity-100",
    title:
      "font-normal text-dimmed group-data-[state=completed]:text-muted group-data-[state=active]:font-semibold group-data-[state=active]:text-highlighted",
    description: "text-muted",
  },
  variants: {
    orientation: {
      horizontal: {
        root: "gap-5",
        // A row too long for a phone wraps its steps instead of overflowing.
        header: "flex-wrap items-center gap-x-2.5 gap-y-3",
        item: "flex w-auto items-center gap-2 text-start whitespace-nowrap",
        container: "contents",
        separator: "static order-last h-px w-7 shrink-0",
        wrapper: "mt-0",
      },
      vertical: {
        root: "gap-5",
        header: "gap-[18px]",
        item: "gap-3",
        separator: "start-[calc(50%-0.5px)] -bottom-3 w-px",
        title: "font-semibold text-highlighted",
      },
    },
    color: {
      primary: {
        trigger:
          "outline-(--dms-accent-tint-strong) group-data-[state=completed]:border-(--dms-accent-fill) group-data-[state=completed]:bg-(--dms-accent-fill) group-data-[state=completed]:text-(--dms-accent-on-fill) group-data-[state=active]:border-primary group-data-[state=active]:bg-(--dms-accent-tint) group-data-[state=active]:text-primary",
        separator:
          "bg-accented group-data-[state=completed]:bg-(--dms-accent-line)",
      },
      neutral: {
        trigger:
          "group-data-[state=completed]:border-inverted group-data-[state=completed]:text-inverted group-data-[state=active]:border-inverted group-data-[state=active]:bg-elevated group-data-[state=active]:text-highlighted",
        separator: "bg-accented group-data-[state=completed]:bg-inverted",
      },
    },
    size: {
      xs: {
        trigger: "size-2.5 text-[0px]",
        icon: "hidden",
        title: "text-xs",
        description: "text-xs",
      },
      sm: {
        trigger: "size-[22px] text-[11px]",
        icon: "size-3",
        title: "text-[12.5px]",
        description: "text-xs",
      },
      md: {
        trigger: "size-6 text-[11px]",
        icon: "size-3",
        title: "text-[13px]",
        description: "text-[12.5px]",
      },
      lg: {
        trigger: "size-7 text-xs",
        icon: "size-3.5",
        title: "text-sm",
        description: "text-[13px]",
      },
      xl: {
        trigger: "size-8 text-[13px]",
        icon: "size-4",
        title: "text-[15px]",
        description: "text-sm",
      },
    },
  },
  compoundVariants: [
    // The current step glows in the row (.au-steps); the setup list keeps
    // the flat tinted dot with its accent hairline (.cs-step__num).
    {
      orientation: "horizontal",
      color: "primary",
      class: {
        trigger:
          "group-data-[state=active]:shadow-[0_0_0_4px_var(--dms-accent-tint)]",
      },
    },
    {
      orientation: "horizontal",
      size: "xs",
      class: {
        trigger:
          "group-data-[state=active]:shadow-[0_0_0_3px_var(--dms-accent-tint)]",
      },
    },
    {
      orientation: "vertical",
      color: "primary",
      class: {
        trigger: "group-data-[state=active]:border-(--dms-accent-line)",
      },
    },
    { orientation: "horizontal", size: "xs", class: { wrapper: "mt-0" } },
    { orientation: "horizontal", size: "sm", class: { wrapper: "mt-0" } },
    { orientation: "horizontal", size: "md", class: { wrapper: "mt-0" } },
    { orientation: "horizontal", size: "lg", class: { wrapper: "mt-0" } },
    { orientation: "horizontal", size: "xl", class: { wrapper: "mt-0" } },
    // Title centred on the dot, description under it, line between dots.
    {
      orientation: "vertical",
      size: "xs",
      class: {
        item: "gap-2.5",
        wrapper: "-mt-[3px]",
        separator: "top-4 start-[calc(50%-0.5px)]",
      },
    },
    {
      orientation: "vertical",
      size: "sm",
      class: { item: "gap-3", wrapper: "mt-0.5", separator: "top-7" },
    },
    {
      orientation: "vertical",
      size: "md",
      class: { item: "gap-3", wrapper: "mt-[3px]", separator: "top-[30px]" },
    },
    {
      orientation: "vertical",
      size: "lg",
      class: { item: "gap-3", wrapper: "mt-1", separator: "top-[34px]" },
    },
    {
      orientation: "vertical",
      size: "xl",
      class: { item: "gap-3.5", wrapper: "mt-1.5", separator: "top-[38px]" },
    },
  ],
};

/**
 * v2 pager (`.pager`): ghost mono page numbers, the accent fill on the
 * current page, and first / prev / next / last as bordered card buttons.
 * Defaults are read as prop defaults (`defaultVariants`). Edge buttons use
 * the same UButton variant as the pages, so their card look is forced.
 */
const PAGER_EDGE =
  "bg-default! text-muted! ring! ring-inset! ring-accented! not-disabled:shadow-(--shadow-xs)! hover:bg-elevated! hover:text-highlighted! disabled:opacity-40!";

const paginationTheme = {
  slots: {
    // A long pager (edges + siblings) wraps on a phone instead of overflowing.
    list: "flex-wrap gap-1",
    item: "font-mono font-medium tabular-nums not-data-[selected=true]:text-toned data-[selected=true]:font-[650] disabled:opacity-40",
    // Mono numbers run a step under the button text (12.5px at md).
    label: "min-w-5 text-[0.96em]",
    ellipsis:
      "w-5! min-w-5 px-0! justify-center text-dimmed! hover:bg-transparent!",
    first: PAGER_EDGE,
    prev: PAGER_EDGE,
    next: PAGER_EDGE,
    last: PAGER_EDGE,
  },
  defaultVariants: {
    color: "neutral",
    variant: "ghost",
    activeColor: "primary",
    activeVariant: "solid",
  },
};

/** v2 text link (`.au-link`, `.c-link`): accent, 550, underline on hover. */
const linkTheme = {
  base: "rounded-[4px] underline-offset-[3px] outline-(--dms-accent-tint-strong)",
  variants: {
    active: {
      true: "text-primary font-semibold",
      false: "text-primary font-[550]",
    },
  },
  compoundVariants: [
    {
      active: false,
      disabled: false,
      class: "hover:text-primary hover:underline",
    },
  ],
};

/**
 * Horizontal navigation menu (`.hnav`): 32px muted items on a hover tint;
 * the active item is ink and semibold with an accent icon and a 2px accent
 * underline on the bar's bottom edge, never a filled pill. `variant="link"`
 * is the record sub-navigation: 40px items, the underline on the hairline.
 * Dropdown panels reuse the menu surface with rich two-line items.
 */
export const NAVIGATION_MENU_HORIZONTAL_COMPOUNDS = [
  {
    orientation: "horizontal",
    class: {
      link: "h-8 gap-[7px] px-2.5 py-0 text-[13.5px] font-medium before:inset-0 before:rounded-lg",
      linkLeadingIcon: "size-4",
      linkTrailingIcon: "size-3 text-dimmed",
      viewport:
        "rounded-[10px] bg-default ring-accented shadow-(--dms-shadow-pop)",
      childList: "p-1",
      childLink: "items-start gap-2.5 p-2 before:rounded-[6px]",
      childLinkIcon: "mt-0.5 size-4 text-muted",
      childLinkLabel: "font-semibold text-highlighted",
      childLinkDescription: "text-xs/[1.35] text-muted",
    },
  },
  {
    orientation: "horizontal",
    variant: "pill",
    active: false,
    disabled: false,
    class: {
      link: "text-muted hover:text-highlighted hover:before:bg-elevated data-[state=open]:text-highlighted data-[state=open]:before:bg-elevated",
    },
  },
  {
    orientation: "horizontal",
    active: true,
    class: {
      link: "font-semibold text-highlighted before:bg-transparent hover:before:bg-elevated after:absolute after:inset-x-2.5 after:-bottom-[9px] after:block after:h-0.5 after:rounded-t-[2px] after:rounded-b-none after:bg-primary",
      linkLeadingIcon: "text-primary group-data-[state=open]:text-primary",
    },
  },
  {
    orientation: "horizontal",
    variant: "link",
    class: {
      list: "gap-[18px]",
      item: "py-0",
      link: "h-10 px-0.5 before:hidden",
      // Counts as mono chips (`.tab__count`).
      linkTrailingBadge:
        "h-4 rounded-[4px] bg-elevated px-[5px] font-mono text-[10.5px] text-dimmed ring-0",
    },
  },
  {
    orientation: "horizontal",
    variant: "link",
    active: true,
    class: {
      link: "after:inset-x-0 after:-bottom-px hover:before:bg-transparent",
    },
  },
];

/**
 * Persistent DMS sidebar: 60px collapsed floor, brand row at the sidebar
 * brand height, 10px gutters and the hairline over the footer on desktop.
 * The mobile menu never opens (DashboardSidebar pins `open` to false).
 */
const dashboardSidebarTheme = {
  slots: {
    root: "min-w-[60px]",
    header: "h-(--dms-sidebar-brand-height) px-1.5",
    body: "no-scrollbar gap-3.5 px-2.5 pt-1 pb-3",
    footer:
      "flex-col items-stretch gap-1.5 px-2.5 pt-2 pb-2.5 lg:border-t lg:border-default",
    toggle: "hidden",
  },
};

/** Navigation primitive themes, spread into `ui` of the app config. */
export const navigationTheme = {
  stepper: stepperTheme,
  pagination: paginationTheme,
  link: linkTheme,
  dashboardSidebar: dashboardSidebarTheme,
};
