import { tv } from "tailwind-variants";

/**
 * The look of a page header, shared by the page's own (`PageHeader`) and the
 * one a record drives (`RecordPageHeader`), so both line up to the pixel.
 */
export const pageHeaderTheme = tv({
  slots: {
    // Wraps so the actions drop under the title once both no longer fit (the
    // layout puts them on their own full-width row below `md`).
    root: "flex flex-wrap gap-x-3.5 gap-y-4 items-start",
    badge:
      "mt-px rounded-[9px] bg-primary/10 shrink-0 ring ring-inset ring-primary/35 flex items-center justify-center size-9",
    icon: "text-primary",
    initials: "text-primary text-sm font-semibold",
    avatar: "mt-px size-9 shrink-0 rounded-[9px]",

    // From `md` the title keeps at least 16rem before the actions wrap.
    content: "flex-1 min-w-0 md:flex-[1_1_16rem]",
    heading: "flex flex-wrap items-center gap-x-2.5 gap-y-1.5",
    // v2 .page-header__title: 24px, weight 650, line-height 1.2, -0.03em.
    title:
      "text-highlighted text-2xl font-[650] leading-[1.2] tracking-[-0.03em]",
    description: "text-muted text-sm mt-1 max-w-[68ch]",
    // Entries set apart by "·", closing each one followed by another so a
    // wrapped line never starts with a separator.
    meta: "text-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] [&>span:has(+span)]:after:text-dimmed [&>span:has(+span)]:after:ms-2 [&>span:has(+span)]:after:content-['·']",
    metaEntry: "inline-flex items-center gap-1",
    metaIcon: "size-3.5",
    metaValue: "text-default font-medium",
    skeletonTitle: "h-7 w-56 max-w-full",
    skeletonDescription: "mt-2 h-4 w-80 max-w-full",
  },
});

export type PageHeaderUi = Partial<typeof pageHeaderTheme.slots>;
