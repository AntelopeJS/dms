// How an event chip looks and reads: its colours as CSS variables, its
// classes for a style, a status and a save state, the edge of its issues,
// and its accessible name. Shared by every view through AgendaEventChip.

import type {
  AgendaEventContent,
  AgendaIssue,
} from "../../../types/full-agenda";
import type { AgendaOccurrence, AgendaOccurrenceState } from "./agendaModel";

/** How a chip is laid out: a block of a time grid, a bar over days, a dot and a time, a planner cell. */
export type AgendaChipLayout = "block" | "bar" | "dot" | "cell";

/** The chip's paint as custom properties its classes read. */
export function chipPaintVars(
  occurrence: AgendaOccurrence,
): Record<string, string> {
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

type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * What a chip's accessible name adds to the agenda's description of the
 * event (`ctx.describe`: title, time, calendar, save state): its status and
 * its issues.
 */
export function chipLabelExtras(
  occurrence: AgendaOccurrence,
  t: Translate,
): string[] {
  const { event } = occurrence;
  const extras: string[] = [];
  if (event.status === "tentative") extras.push(t("dms.agenda.grid.tentative"));
  if (event.status === "cancelled") extras.push(t("dms.agenda.grid.cancelled"));
  if (event.issues?.length) {
    extras.push(t("dms.agenda.grid.issues", { count: event.issues.length }));
  }
  return extras;
}
