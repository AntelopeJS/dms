export default {
  ui: {
    colors: {
      primary: "dms",
      neutral: "neutral",
      // Design semantic hexes map exactly onto these Tailwind palettes:
      // success #10b981 (emerald), warning #f59e0b (amber),
      // error #ef4444 (red), info #06b6d4 (cyan).
      success: "emerald",
      warning: "amber",
      error: "red",
      info: "cyan",
    },
    icons: {
      arrowDown: "i-ph-arrow-down-light",
      arrowLeft: "i-ph-arrow-left-light",
      arrowRight: "i-ph-arrow-right-light",
      arrowUp: "i-ph-arrow-up-light",
      check: "i-ph-check-light",
      chevronDoubleLeft: "i-ph-caret-double-left-light",
      chevronDoubleRight: "i-ph-caret-double-right-light",
      chevronDown: "i-ph-caret-down-light",
      chevronLeft: "i-ph-caret-left-light",
      chevronRight: "i-ph-caret-right-light",
      chevronUp: "i-ph-caret-up-light",
      close: "i-ph-x-light",
      ellipsis: "i-ph-dots-three-light",
      external: "i-ph-arrow-up-right-light",
      menu: "i-ph-list-light",
      minus: "i-ph-minus-light",
      panelClose: "i-ph-sidebar-simple-light",
      panelOpen: "i-ph-sidebar-simple-light",
      plus: "i-ph-plus-light",
      search: "i-ph-magnifying-glass-light",
    },
    dashboardPanel: {
      slots: {
        root: "bg-muted",
        body: "flex flex-col gap-4 sm:gap-6 flex-1 overflow-y-auto px-0",
      },
    },
    drawer: {
      slots: {
        // Same surface as the app canvas (dashboardPanel root bg-muted) so
        // drawer content doesn't stand out as a white sheet over the page.
        content: "bg-muted",
      },
    },
    switch: {
      slots: {
        base: "dark:data-[state=unchecked]:bg-neutral-700",
        thumb: "dark:bg-neutral-100",
      },
      variants: {
        color: {
          // A deeper primary shade keeps contrast with the light thumb.
          primary: {
            base: "dark:data-[state=checked]:bg-(--ui-color-primary-600)",
          },
        },
      },
    },
    card: {
      slots: {
        // Align Nuxt UI cards with the shared .dms-card surface so the few
        // remaining <UCard> usages (notifications, localized fields) match
        // the design system — surface-card bg, hairline border, rounded-xl,
        // soft shadow — instead of Nuxt UI defaults.
        root: "rounded-xl bg-(--dms-surface-card) ring-0 border border-default shadow-sm",
      },
    },
    kbd: {
      // <UKbd> is a single-element component (no slots): base/variants live at
      // the root of its theme.
      // Design keys are monospace caps everywhere (.kkey / .side-search kbd).
      base: "font-mono font-semibold tracking-[0.02em]",
      variants: {
        size: {
          // size="lg" carries the full design .kkey look (settings/shortcuts):
          // taller inset key with a hairline border and a thicker bottom edge.
          lg: "h-[30px] min-w-[34px] rounded-[7px] bg-default text-default border border-accented border-b-2 px-[11px] text-xs ring-0",
        },
      },
    },
    navigationMenu: {
      slots: {
        // Section labels as design eyebrows (.side-label: mono 10px,
        // uppercase, wide tracking, tertiary color).
        label:
          "font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-dimmed pt-2.5 pb-1.5",
        // Sidebar density from the design (.nav-head 13.5px/500, .nav-sub
        // 13px/450, 10px gap) and smaller icons (design 17px head / 15px sub
        // vs Nuxt UI's 20px size-5).
        link: "text-[13.5px] gap-2.5",
        linkLeadingIcon: "size-[17px]",
        linkTrailingIcon: "size-4",
        childLink: "text-[13px] gap-2.5 font-normal",
        childLinkIcon: "size-[15px]",
      },
      compoundVariants: [
        // Active item box in primary tint (design: accent-bg) instead of
        // the default elevated gray.
        {
          variant: "pill",
          active: true,
          highlight: false,
          class: {
            link: "before:bg-primary/10 font-semibold",
          },
        },
        {
          variant: "pill",
          active: true,
          highlight: true,
          disabled: false,
          class: {
            link: "before:bg-primary/10 hover:before:bg-primary/15 font-semibold",
          },
        },
        // Nested active item (design nav-sub.is-active): the box extends
        // left to the child guide line with a flat edge, and the primary
        // bar covers the full row height on that line.
        {
          orientation: "vertical",
          highlight: true,
          level: true,
          active: true,
          class: {
            link: "before:-start-1.5 before:rounded-s-none after:inset-y-0 after:w-[2px] after:rounded-none",
          },
        },
      ],
    },
    button: {
      slots: {
        // Tactile press + full transition (design .btn active:scale(.97)).
        base: "transition active:scale-[0.98]",
      },
      compoundVariants: [
        // Inset top highlight on the solid primary fill (design .btn-primary).
        {
          color: "primary",
          variant: "solid",
          class: "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)]",
        },
      ],
    },
    badge: {
      // Design badges are semibold (b-* = font-weight 600).
      base: "font-semibold",
      // Pill shape (design --radius-full); the size variants set rounded-sm/md,
      // so override at the variant level to win the cascade.
      variants: {
        size: {
          xs: { base: "rounded-full" },
          sm: { base: "rounded-full" },
          md: { base: "rounded-full" },
          lg: { base: "rounded-full" },
          xl: { base: "rounded-full" },
        },
      },
      // The subtle ring is set per-color via compoundVariants; append ring-0
      // after them so the design's flat (borderless) tint wins the cascade.
      compoundVariants: [{ variant: "subtle", class: "ring-0" }],
      // Subtle tint is the design default (b-success/b-warning… = 10% fills).
      defaultVariants: {
        variant: "subtle",
      },
    },
    // Recessed (inset) field background: faint gray on light cards, the page
    // canvas color on dark cards — matches the design --surface-inset look.
    input: {
      variants: { variant: { outline: "bg-muted dark:bg-default" } },
    },
    textarea: {
      variants: { variant: { outline: "bg-muted dark:bg-default" } },
    },
    select: {
      variants: { variant: { outline: "bg-muted dark:bg-default" } },
    },
    selectMenu: {
      variants: { variant: { outline: "bg-muted dark:bg-default" } },
    },
    inputNumber: {
      variants: { variant: { outline: "bg-muted dark:bg-default" } },
    },
    inputMenu: {
      variants: { variant: { outline: "bg-muted dark:bg-default" } },
    },
    inputTags: {
      variants: { variant: { outline: "bg-muted dark:bg-default" } },
    },
    table: {
      slots: {
        // Tinted header cells + full-row hover (design table.tbl thead / tr:hover).
        th: "bg-muted",
        tbody: "[&>tr]:hover:bg-elevated/30",
      },
    },
    tabs: {
      slots: {
        // Active tab in the cyan accent (design .tbl-tab.is-active).
        trigger:
          "data-[state=active]:text-primary data-[state=active]:font-semibold",
      },
      variants: {
        variant: {
          // Active "box" as a flat accent tint instead of the white pill.
          pill: { indicator: "bg-primary/10 shadow-none" },
        },
      },
    },
    modal: {
      slots: {
        // Stronger elevation for the centered dialog (design .modal-box shadow-xl).
        content: "shadow-xl",
      },
    },
    slideover: {
      slots: {
        content: "sm:shadow-xl",
      },
    },
    popover: {
      slots: {
        // Slightly larger radius for floating panels (design menus radius-lg).
        content: "rounded-lg",
      },
    },
    dropdownMenu: {
      slots: {
        content: "rounded-lg",
      },
    },
    breadcrumb: {
      slots: {
        // Match the design .crumbs: ~13.5px medium text, current segment in
        // the cyan accent (.crumb-cur), and much smaller icons/chevrons
        // (Nuxt UI defaults them to size-5 / 20px).
        link: "text-[13.5px] font-medium aria-[current=page]:text-primary aria-[current=page]:font-semibold",
        linkLeadingIcon: "size-3.5",
        separatorIcon: "size-3.5",
      },
    },
  },
  branding: {
    logo: {
      default: {
        light: "/images/antelope-logo/light.svg",
        dark: "/images/antelope-logo/dark.svg",
      },
      collapsed: {
        light: "/images/antelope-logo/icon.svg",
        dark: "/images/antelope-logo/icon.svg",
      },
    },
  },
};
