/**
 * Nuxt UI themes of the data display primitives (DMS design v2, mockup
 * components/table.html, form.html tree picker, shell.html dots and
 * auth.html separator), spread into the app config `ui` key. Each entry
 * extends the Nuxt UI default theme: slot and variant classes are appended
 * and tailwind-merged over it, and compound variants run after the defaults.
 *
 * Every class stays a literal string so Tailwind finds it when scanning.
 */

/**
 * A plain UTable reads like the DMS table (build/components/table/Table.vue):
 * mono eyebrow headers on the muted band, 44px rows on hairline dividers,
 * the accent tint and a 2px accent edge on selected rows, the 2px accent
 * loading bar under the header and 18px outer gutters.
 */
const tableTheme = {
  slots: {
    root: "outline-(--dms-accent-tint-strong)",
    th: "h-9 px-3.5 py-0 first:ps-[18px] last:pe-4 bg-(--dms-bg-muted) border-b border-default font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase text-dimmed",
    td: "h-11 px-3.5 py-0 first:ps-[18px] last:pe-4 text-[13px] text-toned",
    tbody:
      "divide-(--ui-border-muted) [&>tr]:data-[selectable=true]:hover:bg-elevated/60 [&>tr]:data-[selectable=true]:outline-(--dms-accent-tint-strong)",
    tr: "data-[selected=true]:bg-(--dms-accent-tint) data-[selected=true]:[&>td:first-child]:shadow-[inset_2px_0_0_var(--dms-accent)]",
    separator: "hidden",
    empty: "py-11 text-[13px] text-muted",
    loading: "py-11",
  },
  variants: {
    sticky: {
      true: { thead: "bg-(--dms-bg-muted)" },
      header: { thead: "bg-(--dms-bg-muted)" },
    },
    loading: {
      true: { thead: "after:bottom-0 after:h-0.5" },
    },
  },
  compoundVariants: [
    {
      loading: true,
      loadingColor: "primary",
      class: { thead: "after:bg-(--dms-accent-fill)" },
    },
  ],
};

/**
 * v2 tree picker (`.tree__row`): 30px rows with a 6px hover box, ink-2
 * labels, 15px muted icons, a small dimmed caret and 22px indent steps
 * without a guide line; the selected row takes the accent tint and ink.
 */
const treeTheme = {
  slots: {
    listWithChildren: "border-s-0",
    itemWithChildren: "ps-0 ms-0",
    link: "text-toned before:inset-y-0 before:rounded-[6px]",
    linkLeadingIcon: "text-muted",
    linkTrailingIcon: "text-dimmed",
  },
  variants: {
    color: {
      primary: { link: "before:outline-(--dms-accent-tint-strong)" },
    },
    size: {
      sm: {
        listWithChildren: "ms-5",
        link: "h-7 px-2 py-0 text-[12.5px] gap-2",
        linkLeadingIcon: "size-3.5",
        linkTrailingIcon: "size-3",
      },
      md: {
        listWithChildren: "ms-[22px]",
        link: "h-[30px] px-2 py-0 text-[13px] gap-2",
        linkLeadingIcon: "size-[15px]",
        linkTrailingIcon: "size-3.5",
      },
      lg: {
        listWithChildren: "ms-6",
        link: "h-8 px-2.5 py-0 text-sm gap-2",
        linkLeadingIcon: "size-4",
        linkTrailingIcon: "size-3.5",
      },
    },
  },
  compoundVariants: [
    {
      color: "primary",
      selected: true,
      class: {
        link: "before:bg-(--dms-accent-tint) text-primary",
        linkLeadingIcon: "text-primary",
      },
    },
    {
      selected: false,
      disabled: false,
      class: { link: "hover:before:bg-elevated" },
    },
  ],
};

/**
 * v2 dots (`.notif-dot`): the accent fill ringed by the surface it sits on,
 * mono counts in the fill ink.
 */
const chipTheme = {
  slots: {
    base: "ring-2 ring-(--ui-bg) font-mono font-semibold",
  },
  variants: {
    color: {
      primary: "bg-(--dms-accent-fill) text-(--dms-accent-on-fill)",
      error: "text-white",
    },
  },
};

/** Hairline rules; a label reads as the mono eyebrow (auth "or" divider). */
const separatorTheme = {
  slots: {
    container:
      "font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase text-dimmed",
    label: "text-[10.5px]",
    icon: "size-4 text-dimmed",
  },
  variants: {
    color: {
      neutral: { border: "border-default" },
    },
  },
};

/**
 * v2 empty state (`.tempty`): a 44px icon well on the card surface, 14px
 * semibold title, 13px muted description, actions under it.
 */
const emptyTheme = {
  slots: {
    root: "gap-3 rounded-(--dms-radius-card)",
    avatar:
      "rounded-[10px] bg-default bg-none ring ring-inset ring-accented shadow-(--shadow-sm) [&_[data-slot=icon]]:text-muted",
    title: "font-[650] text-highlighted",
    description: "text-muted",
    actions: "mt-1",
  },
  variants: {
    size: {
      md: {
        avatar: "size-11 text-[22px]",
        title: "text-sm",
        description: "text-[13px]",
      },
    },
    variant: {
      outline: {
        root: "bg-(--dms-surface-card) ring-default shadow-(--dms-shadow-card)",
      },
      soft: { root: "bg-(--dms-bg-muted)", description: "text-muted" },
      subtle: {
        root: "bg-(--dms-bg-muted) ring ring-default",
        description: "text-muted",
      },
    },
  },
};

/** Data display primitive themes, spread into `ui` of the app config. */
export const dataTheme = {
  table: tableTheme,
  tree: treeTheme,
  chip: chipTheme,
  separator: separatorTheme,
  empty: emptyTheme,
};
