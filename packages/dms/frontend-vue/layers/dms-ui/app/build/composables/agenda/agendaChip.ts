import type { NamedValue } from "vue-i18n";

import type { BlockText } from "../../../../../dms-core/app/types/composed-text";
import type {
  AgendaBadge,
  AgendaEventContent,
  AgendaIssue,
  AgendaMarkTone,
  AgendaTone,
} from "../../../types/full-agenda";
import type { AgendaOccurrence, AgendaOccurrenceState } from "./agendaModel";

/** How a chip is laid out: a block of a time grid, a bar over days, a dot and a time, a planner cell. */
export type AgendaChipLayout = "block" | "bar" | "dot" | "cell";

/** The chip's paint as the custom properties its classes read. */
export type ChipPaintVars = Record<
  "--agenda-tint" | "--agenda-bar" | "--agenda-ink" | "--agenda-on-bar",
  string
>;

/** The chip's paint as custom properties its classes read. */
export function chipPaintVars(occurrence: AgendaOccurrence): ChipPaintVars {
  const { paint } = occurrence;
  return {
    "--agenda-tint": paint.background,
    "--agenda-bar": paint.bar,
    "--agenda-ink": paint.text,
    "--agenda-on-bar": paint.onBar,
  };
}

const STYLE_CLASSES = {
  soft: "bg-(--agenda-tint) text-(--agenda-ink)",
  solid: "bg-(--agenda-bar) text-(--agenda-on-bar)",
  outline:
    "bg-default text-(--agenda-ink) ring-1 ring-inset ring-(--agenda-bar)",
  dashed:
    "bg-(--agenda-tint) text-(--agenda-ink) outline-1 -outline-offset-1 outline-dashed outline-(--agenda-bar)",
} as const;

const STATE_CLASSES: Record<AgendaOccurrenceState, string> = {
  staged: "outline-2 outline-offset-1 outline-dashed outline-(--ui-primary)",
  saving: "opacity-75",
  error: "outline-2 outline-offset-1 outline-(--ui-error)",
  conflict: "outline-2 outline-offset-1 outline-(--ui-warning)",
};

/** The icon beside the title for a save state. */
export const STATE_ICONS: Record<AgendaOccurrenceState, string> = {
  staged: "i-ph-pencil-simple",
  saving: "i-ph-circle-notch",
  error: "i-ph-warning-circle",
  conflict: "i-ph-arrows-clockwise",
};

/** The edge an event with issues carries (error first). */
export function issueTone(
  issues: AgendaIssue[] | undefined,
): "error" | "warning" | null {
  if (!issues?.length) return null;
  return issues.some((issue) => issue.tone === "error") ? "error" : "warning";
}

/** How strong a tone is, for the alert mark: an error first, a neutral last. */
const TONE_RANK: Record<AgendaTone, number> = {
  error: 0,
  warning: 1,
  info: 2,
  primary: 3,
  success: 4,
  neutral: 5,
};

/** The icon of the alert mark when its strongest alert names none. */
export const ALERT_MARK_ICON = "i-ph-seal-warning-fill";

/** What a chip marks of its event's alert badges: the strongest tone, its icon, and every alert's label. */
export interface AlertMark {
  readonly tone: AgendaTone;
  readonly icon: string;
  readonly labels: readonly AgendaBadge["label"][];
}

/**
 * The alert mark of an event: its badges flagged
 * `alert`, as one icon in the tone of the strongest (an error before a
 * warning), named by all their labels in order; `null` when none is an alert.
 * A chip draws it whatever its height, so a short event still shows
 * that its subject has an alert.
 */
export function alertMarkOf(
  badges: readonly AgendaBadge[] | undefined,
): AlertMark | null {
  const alerts = (badges ?? []).filter((badge) => badge.alert === true);
  const [strongest] = [...alerts].sort(
    (a, b) => TONE_RANK[a.tone ?? "neutral"] - TONE_RANK[b.tone ?? "neutral"],
  );
  if (!strongest) return null;
  return {
    tone: strongest.tone ?? "neutral",
    icon: strongest.icon ?? ALERT_MARK_ICON,
    labels: alerts.map((badge) => badge.label),
  };
}

/** The solid disc a status mark sits on, per tone: the tone's own colour, the icon inverted over it. */
export const MARK_DISC_CLASSES: Record<AgendaMarkTone, string> = {
  error: "bg-(--ui-error) text-inverted",
  warning: "bg-(--ui-warning) text-inverted",
  info: "bg-(--ui-info) text-inverted",
  primary: "bg-(--ui-primary) text-inverted",
  secondary:
    "bg-(--ui-color-secondary-700) text-inverted dark:bg-(--ui-color-secondary-400)",
  success: "bg-(--ui-success) text-inverted",
  neutral: "bg-(--ui-bg-inverted) text-inverted",
};

/** The dot of a status mark on a planner cell, per tone. */
export const MARK_DOT_CLASSES: Record<AgendaMarkTone, string> = {
  error: "bg-(--ui-error)",
  warning: "bg-(--ui-warning)",
  info: "bg-(--ui-info)",
  primary: "bg-(--ui-primary)",
  secondary: "bg-(--ui-color-secondary-700) dark:bg-(--ui-color-secondary-400)",
  success: "bg-(--ui-success)",
  neutral: "bg-(--ui-bg-inverted)",
};

/** The lines a block can show under its title, in the order they stack. */
export type BlockLine =
  | "time"
  | "subtitle"
  | "location"
  | "resource"
  | "description"
  | "badges";

/** The vertical metrics of a block, from its classes (`text-xs leading-tight`, or the compact density). */
interface BlockMetrics {
  padding: number;
  line: number;
  gap: number;
}

const BLOCK_METRICS: Record<"normal" | "compact", BlockMetrics> = {
  normal: { padding: 8, line: 15, gap: 2 },
  compact: { padding: 4, line: 13.75, gap: 0 },
};
const BADGE_ROW_HEIGHT = 24;
const DESCRIPTION_LINES = 2;
const FIT_TOLERANCE = 0.5;

/**
 * The lines of a block that fit whole in its height, in their order.
 * The title line always shows and is not listed.
 * A line that does not fit ends the list: a lower line never shows while a
 * higher one is cut, and no line shows cut in half.
 */
export function blockLinesThatFit(
  height: number,
  density: "normal" | "compact",
  wanted: readonly BlockLine[],
): BlockLine[] {
  const { padding, line, gap } = BLOCK_METRICS[density];
  let used = padding + line;
  const fitting: BlockLine[] = [];
  for (const kind of wanted) {
    const own =
      kind === "badges"
        ? BADGE_ROW_HEIGHT
        : kind === "description"
          ? line * DESCRIPTION_LINES
          : line;
    used += gap + own;
    if (used > height + FIT_TOLERANCE) break;
    fitting.push(kind);
  }
  return fitting;
}

const ISSUE_EDGES = {
  error: "shadow-[inset_-3px_0_0_0_var(--ui-error)]",
  warning: "shadow-[inset_-3px_0_0_0_var(--ui-warning)]",
} as const;

/** The classes of a chip: its style, then status, muting, save state and issues over it. */
export function chipClasses(
  occurrence: AgendaOccurrence,
  layout: AgendaChipLayout,
): string[] {
  const { event } = occurrence;
  const isDot = layout === "dot";
  const style =
    event.status === "tentative" && !event.style
      ? "dashed"
      : (event.style ?? "soft");
  const classes = [
    isDot ? "text-default hover:bg-(--agenda-tint)" : STYLE_CLASSES[style],
  ];
  if (event.status === "cancelled") classes.push("line-through opacity-60");
  if (event.muted) classes.push("opacity-55 saturate-50");
  if (occurrence.state) classes.push(STATE_CLASSES[occurrence.state]);
  const tone = issueTone(event.issues);
  if (tone && !isDot) classes.push(ISSUE_EDGES[tone]);
  return classes;
}

/** Text of an HTML description, for a tooltip or a one-line preview. */
export function plainText(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** What the chip shows, `eventContent` merged over its defaults. */
export type ResolvedEventContent = Required<AgendaEventContent>;

export function resolveEventContent(
  content: AgendaEventContent | undefined,
): ResolvedEventContent {
  return {
    time: true,
    subtitle: true,
    location: true,
    icon: true,
    badges: true,
    avatar: true,
    resource: false,
    description: false,
    ...content,
  };
}

type Translate = (key: string, params?: NamedValue) => string;

/**
 * What a chip's accessible name adds to the agenda's description of the
 * event (`ctx.describe`: title, time, calendar, save state): its mark's label,
 * the labels of its pinned badges, its status, in
 * the event's own `statusLabel` (read through `text`) when it has one, and its
 * issues. A status is named once: an event with a mark leaves out the
 * `statusLabel` and the cancelled wording the mark already says.
 */
export function chipLabelExtras(
  occurrence: AgendaOccurrence,
  t: Translate,
  text: (value: BlockText) => string,
): string[] {
  const { event } = occurrence;
  const extras: string[] = [];
  if (event.mark) extras.push(text(event.mark.label));
  for (const badge of pinnedBadgesOf(event.badges))
    extras.push(text(badge.label));
  const named = !event.mark && event.statusLabel && text(event.statusLabel);
  if (named) extras.push(named);
  else if (event.status === "tentative")
    extras.push(t("dms.agenda.grid.tentative"));
  else if (event.status === "cancelled" && !event.mark)
    extras.push(t("dms.agenda.grid.cancelled"));
  if (event.issues?.length) {
    extras.push(t("dms.agenda.grid.issues", { count: event.issues.length }));
  }
  return extras;
}

/**
 * The badges of an event flagged `pinned` (an overbooked slot): a chip draws one icon for each whatever its
 * height, and names them in its accessible name and its tooltip.
 */
export function pinnedBadgesOf(
  badges: readonly AgendaBadge[] | undefined,
): AgendaBadge[] {
  return (badges ?? []).filter((badge) => badge.pinned === true);
}

/** The colour of the alert mark, by the tone of its strongest alert. */
export const ALERT_MARK_TONES: Record<AgendaTone, string> = {
  error: "text-error",
  warning: "text-warning",
  info: "text-info",
  primary: "text-primary",
  success: "text-success",
  neutral: "text-muted",
};

/** A tall bar (a timeline's two-line lane): its subtitle on a line of its own. */
export const TWO_LINE_BAR_CLASSES =
  "flex-col items-stretch justify-center gap-0.5 px-1.5 text-xs leading-tight";

/** The corners of a chip, by layout. */
export const CHIP_ROUNDED: Record<AgendaChipLayout, string> = {
  block: "rounded-md",
  bar: "rounded-md",
  dot: "rounded-md",
  cell: "rounded-sm",
};

/** How a chip lays out its lines, by layout. */
export const CHIP_LAYOUT_CLASSES: Record<AgendaChipLayout, string> = {
  block: "flex-col items-stretch gap-0.5 px-1.5 py-1 text-xs leading-tight",
  bar: "items-center gap-1 px-1.5 text-xs leading-none",
  dot: "items-center gap-1.5 px-1 text-xs leading-none",
  cell: "items-center justify-center text-[10px] font-semibold leading-none",
};

/** `density: "compact"`: tighter paddings and a smaller text, by layout. */
export const CHIP_COMPACT_CLASSES: Record<AgendaChipLayout, string> = {
  block: "flex-col items-stretch gap-0 px-1 py-0.5 text-[11px] leading-tight",
  bar: "items-center gap-1 px-1 text-[11px] leading-none",
  dot: "items-center gap-1 px-0.5 text-[11px] leading-none",
  cell: "items-center justify-center text-[9px] font-semibold leading-none",
};
