import { REORDER_HANDLE_CLASS } from "../../composables/table-view/useReorderHandles";
import { tv } from "tailwind-variants";
import { EYEBROW_CLASS } from "../../utils/eyebrow";

const PANEL_MATCH_BG = "bg-(--dms-surface-card)";

const HEADER_PLACEMENT = "header";

const HEADER_MATCH_BG = "bg-(--dms-bg-muted)";

const ROW_HOVER_BG = "hover:bg-elevated";
const ROW_HOVER_CELL_BG = "group-hover:bg-elevated";

const ROW_SELECTED_BG = "data-[selected=true]:bg-primary/10";
const ROW_SELECTED_CELL_BG =
  "group-data-[selected=true]:bg-[color-mix(in_srgb,var(--ui-primary)_10%,var(--dms-surface-card))]";

const ROW_OPEN_BG =
  "data-[open=true]:bg-primary/10 data-[open=true]:[&>td:first-child]:shadow-[inset_2px_0_0_0_var(--ui-primary)]";
const ROW_OPEN_CELL_BG =
  "group-data-[open=true]:bg-[color-mix(in_srgb,var(--ui-primary)_10%,var(--dms-surface-card))]";

const ROW_EXPANDED_BG = "data-[expanded=true]:bg-elevated";
const ROW_EXPANDED_CELL_BG = "group-data-[expanded=true]:bg-elevated";

const HEADER_SCROLL_SHADOW =
  "shadow-[0_8px_10px_-8px_color-mix(in_srgb,var(--ui-border-accented)_90%,transparent)]";

const FIRST_HEAD_CELL_GUTTER = "first:ps-[18px] [th:empty:first-child+&]:ps-4";
const FIRST_ROW_CELL_GUTTER = "first:ps-[18px] [td:empty:first-child+&]:ps-4";

const theme = tv({
  slots: {
    root: "dms-card flow-root overflow-hidden",
    header:
      "flex flex-wrap items-center gap-x-3 gap-y-2.5 py-3 ps-[18px] pe-3.5",
    caption:
      "me-auto flex min-w-0 items-center gap-2.5 text-[15px] leading-[1.2] font-[650] tracking-[-0.015em] text-highlighted",
    captionLabel: "truncate",
    captionCount: "font-mono text-xs font-medium tabular-nums text-dimmed",
    captionCountPlaceholder: "h-3 w-6 rounded-[4px]",

    scrollFrame: "relative",

    scrollFade: "pointer-events-none absolute inset-y-0 z-30 w-3",
    tableRoot: "relative overflow-x-auto whitespace-nowrap",
    tableBase: "inline-block min-w-full align-middle",
    table: "text-default w-full min-w-full table-fixed text-left text-[13px]/5",
    tableCaption: "sr-only",

    loadingBar:
      "pointer-events-none absolute inset-x-0 top-9 z-40 h-0.5 overflow-hidden",
    loadingBarIndicator:
      "absolute inset-y-0 start-0 w-1/2 rounded-full bg-(--dms-accent-fill) animate-[carousel_1.3s_ease-in-out_infinite]",
    skeletonRow: "pointer-events-none",
    skeletonCell: "block h-2.5 rounded-md",

    archiveStrip:
      "flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-(--dms-warning-line) bg-(--dms-warning-tint) py-[9px] ps-[18px] pe-3.5 text-[13px] text-highlighted",
    archiveStripIcon: "size-[17px] shrink-0 text-warning",
    archiveStripText: "min-w-0",
    archiveStripTitle: "font-semibold",
    archiveStripDescription: "text-[12.5px] text-muted",
    archiveStripAction: "ms-auto",

    expandedCell:
      "border-b border-default bg-(--dms-bg-muted) p-0 whitespace-normal in-[tr:last-child]:border-b-0",

    expandedBody:
      "sticky start-0 w-[var(--dms-table-viewport,auto)] pt-4 pb-[18px] pe-[18px] ps-[18px] sm:ps-[68px]",

    emptyBody: "sticky start-0 w-[var(--dms-table-viewport,auto)]",

    headCell: `${HEADER_MATCH_BG} ${FIRST_HEAD_CELL_GUTTER} border-b-default text-dimmed group relative touch-none select-none overflow-hidden border-b h-9 px-3.5 py-0 ${EYEBROW_CLASS} last:pe-2.5`,
    headCellInternal: "flex w-full items-center justify-between gap-1",
    colOptionsTrigger: "opacity-0 transition-opacity group-hover:opacity-100",
    colResizer:
      "bg-primary/40 absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize touch-none select-none opacity-0 hover:opacity-100",

    row: `group ${ROW_SELECTED_BG} ${ROW_EXPANDED_BG} ${ROW_OPEN_BG}`,
    rowCell: `${FIRST_ROW_CELL_GUTTER} border-b-muted border-b h-11 px-3.5 py-0 text-[13px] last:pe-2.5 in-[tr:last-child]:border-b-0 group-data-[expanded=true]:border-b-transparent`,
    rowInternal: "transition-opacity duration-150",
    rowContainer: "relative",
    rowSpan: "line-clamp-1 text-ellipsis",

    rowSelection:
      "opacity-40 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
    rowAction:
      "flex items-center justify-end gap-1 opacity-40 transition-opacity group-hover:opacity-100 group-data-[selected=true]:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100",

    columnActiveSortIcon: "size-3 shrink-0 text-primary",

    groupCell: `${HEADER_MATCH_BG} border-b border-default p-0`,
    groupHeader:
      "sticky start-0 flex h-9 w-[var(--dms-table-viewport,auto)] items-center gap-2 ps-[18px] pe-3.5 text-[12.5px] text-muted",
    groupToggle:
      "inline-flex min-w-0 items-center gap-2 hover:text-highlighted",
    groupCount:
      "rounded-[4px] bg-elevated px-[5px] py-px font-mono text-[10.5px] font-semibold tabular-nums text-dimmed",

    handleHeadCell: `${HEADER_MATCH_BG} border-b-default w-8 border-b p-0`,
    handleCell:
      "border-b-muted w-8 border-b ps-2 pe-0 in-[tr:last-child]:border-b-0",
    handle: REORDER_HANDLE_CLASS,
  },
  variants: {
    cellWrap: {
      true: {
        rowCell: "py-2.5",
        rowSpan: "line-clamp-none whitespace-normal [overflow-wrap:anywhere]",
      },
    },

    headerDivided: {
      true: {
        header: "border-b border-default",
      },
    },

    tabsInline: {
      true: {
        header: "min-h-11 py-0",
      },
    },
    pinned: {
      left: {
        headCell: `${HEADER_MATCH_BG} sticky z-10 shadow-[2px_0_0_0_rgba(0,0,0,0.06)]`,
        rowCell: `${PANEL_MATCH_BG} ${ROW_SELECTED_CELL_BG} ${ROW_EXPANDED_CELL_BG} ${ROW_OPEN_CELL_BG} group-data-[presence=true]:bg-elevated sticky z-10 shadow-[2px_0_0_0_rgba(0,0,0,0.06)]`,
      },
      right: {
        headCell: `${HEADER_MATCH_BG} sticky z-10 shadow-[-2px_0_0_0_rgba(0,0,0,0.06)]`,
        rowCell: `${PANEL_MATCH_BG} ${ROW_SELECTED_CELL_BG} ${ROW_EXPANDED_CELL_BG} ${ROW_OPEN_CELL_BG} group-data-[presence=true]:bg-elevated sticky z-10 shadow-[-2px_0_0_0_rgba(0,0,0,0.06)]`,
      },
    },

    density: {
      default: "",
      compact: {
        headCell: "h-8",
        rowCell: "h-9 text-[12.5px]",
        loadingBar: "top-8",
      },
    },

    scrollArea: {
      true: {
        tableRoot: "overflow-y-auto overscroll-contain",
        table: "border-separate border-spacing-0",
        headCell: "sticky top-0 z-20",
      },
    },
    scrolled: {
      true: "",
    },
    side: {
      start: {
        scrollFade: "shadow-[inset_12px_0_10px_-10px_rgb(0_0_0/0.28)]",
      },
      end: {
        scrollFade: "shadow-[inset_-12px_0_10px_-10px_rgb(0_0_0/0.28)]",
      },
    },

    archived: {
      true: {
        rowCell: "text-muted",
        rowAction: "opacity-100",
      },
    },

    loading: {
      true: {
        row: "cursor-wait hover:bg-transparent",
        rowInternal: "opacity-60 delay-200",
      },
    },
    rowClickable: {
      true: "",
    },
    isResizing: {
      true: {
        colResizer: "opacity-100",
      },
    },
    rowSelected: {
      true: {
        rowSelection: "opacity-100",
      },
    },

    prominent: {
      true: {
        rowAction: "opacity-100",
      },
    },
    presence: {
      true: {
        row: "bg-elevated",
      },
    },
  },
  compoundVariants: [
    {
      loading: false,
      rowClickable: true,
      class: {
        row: ROW_HOVER_BG,
      },
    },
    {
      loading: false,
      rowClickable: true,
      pinned: ["left", "right"],
      class: {
        rowCell: ROW_HOVER_CELL_BG,
      },
    },
    {
      scrollArea: true,
      pinned: ["left", "right"],
      class: {
        headCell: "z-30",
      },
    },
    {
      scrollArea: true,
      scrolled: true,
      class: {
        headCell: HEADER_SCROLL_SHADOW,
      },
    },
  ],
});

export {
  PANEL_MATCH_BG,
  HEADER_PLACEMENT,
  HEADER_MATCH_BG,
  ROW_HOVER_CELL_BG,
  theme,
};
