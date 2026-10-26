// How the shell of a FullAgenda lays itself out: the toolbar's parts, the
// sidebar and its sections, where the legend goes, and what a container
// width turns into (a folded sidebar, a select for the views, a drawer for
// the details). Pure: the block feeds it the context's width and data.

import type {
  AgendaCalendar,
  AgendaCalendarGroup,
  AgendaDetailsContainer,
  AgendaLegend,
  AgendaNotice,
  AgendaSidebar,
  AgendaSidebarSection,
  AgendaToolbar,
  AgendaTone,
  FullAgendaOptions,
} from "../../../types/full-agenda";
import type { AgendaOccurrence } from "./agendaModel";

/** Every part of the toolbar, each on or off. */
export type ResolvedAgendaToolbar = Required<AgendaToolbar>;

const TOOLBAR_DEFAULTS: ResolvedAgendaToolbar = {
  title: true,
  today: true,
  navigation: true,
  viewSwitcher: true,
  datePicker: false,
  refresh: false,
  exportIcs: false,
};

/** The toolbar's parts, `null` without a toolbar. */
export function resolveToolbar(
  toolbar: FullAgendaOptions["toolbar"],
): ResolvedAgendaToolbar | null {
  if (toolbar === false) return null;
  if (toolbar === true || toolbar === undefined) return { ...TOOLBAR_DEFAULTS };
  return { ...TOOLBAR_DEFAULTS, ...toolbar };
}

/** The sidebar with its defaults applied. */
export interface ResolvedAgendaSidebar {
  position: "left" | "right";
  width: number;
  collapsible: boolean;
  collapsed: boolean;
  /** `undefined`: the sections the data feeds (see {@link sidebarSections}). */
  sections?: AgendaSidebarSection[];
  tip?: AgendaSidebar["tip"];
}

export const AGENDA_SIDEBAR_WIDTH = 264;

/**
 * The sidebar, `null` without one. An agenda shows one when `sidebar` asks,
 * or when it has pending items to plan (`unscheduled`) and `sidebar` does not
 * say no.
 */
export function resolveSidebar(
  options: Pick<FullAgendaOptions, "sidebar" | "unscheduled">,
): ResolvedAgendaSidebar | null {
  const { sidebar } = options;
  if (sidebar === false) return null;
  if (sidebar === undefined && !options.unscheduled) return null;
  const given: AgendaSidebar = typeof sidebar === "object" ? sidebar : {};
  return {
    position: given.position ?? "left",
    width: given.width ?? AGENDA_SIDEBAR_WIDTH,
    collapsible: given.collapsible ?? true,
    collapsed: given.collapsed ?? false,
    sections: given.sections,
    tip: given.tip,
  };
}

/** What the default sections of the sidebar depend on. */
export interface AgendaSidebarFeeds {
  calendars: number;
  pending: number;
  notices: number;
  /** `unscheduled` is set: the section stays, even empty, to drop events back. */
  hasUnscheduled: boolean;
}

/** The sections of the sidebar, in order: the listed ones, else those the data feeds. */
export function sidebarSections(
  sidebar: ResolvedAgendaSidebar,
  feeds: AgendaSidebarFeeds,
): AgendaSidebarSection[] {
  if (sidebar.sections) return sidebar.sections;
  const sections: AgendaSidebarSection[] = ["miniCalendar"];
  if (feeds.calendars > 0) sections.push("calendars");
  if (feeds.hasUnscheduled || feeds.pending > 0) sections.push("unscheduled");
  if (feeds.notices > 0) sections.push("notices");
  if (sidebar.tip) sections.push("tip");
  return sections;
}

/** The legend with its defaults applied. */
export interface ResolvedAgendaLegend {
  position: "sidebar" | "toolbar" | "bottom";
  toggles: boolean;
  counts: boolean;
  title?: AgendaLegend["title"];
}

/**
 * The legend, `null` without one (`legend: false`, or no calendar). It sits in
 * the sidebar when the sidebar lists the calendars, else above the views.
 */
export function resolveLegend(
  legend: FullAgendaOptions["legend"],
  calendars: number,
  sidebarListsCalendars: boolean,
): ResolvedAgendaLegend | null {
  if (legend === false || calendars === 0) return null;
  const given: AgendaLegend = typeof legend === "object" ? legend : {};
  return {
    position: given.position ?? (sidebarListsCalendars ? "sidebar" : "toolbar"),
    toggles: given.toggles ?? true,
    counts: given.counts ?? true,
    title: given.title,
  };
}

/** What a container width makes of the shell. */
export interface AgendaShellInput {
  width: number;
  compact: boolean;
  sidebar: ResolvedAgendaSidebar | null;
  /** The sidebar column is unfolded (wide container). */
  sidebarOpen: boolean;
  /** The sidebar sheet is open over the agenda (compact container). */
  overlayOpen: boolean;
  details: AgendaDetailsContainer;
  viewCount: number;
  viewSwitcher: boolean;
}

/** How the sidebar shows: a column, folded to a button, a sheet over the agenda. */
export type AgendaSidebarMode = "none" | "column" | "folded" | "overlay";

export interface AgendaShellLayout {
  sidebar: AgendaSidebarMode;
  switcher: "none" | "segmented" | "select";
  /** Where details open: a popover becomes a drawer in a compact container. */
  details: AgendaDetailsContainer;
}

/** Pixels the toolbar needs besides the views' segments. */
const TOOLBAR_BASE_WIDTH = 480;
const SEGMENT_WIDTH = 80;

function sidebarMode(input: AgendaShellInput): AgendaSidebarMode {
  if (!input.sidebar) return "none";
  if (input.compact) return input.overlayOpen ? "overlay" : "folded";
  return input.sidebarOpen ? "column" : "folded";
}

function switcherMode(input: AgendaShellInput): AgendaShellLayout["switcher"] {
  if (!input.viewSwitcher || input.viewCount <= 1) return "none";
  if (input.compact) return "select";
  const needed = TOOLBAR_BASE_WIDTH + SEGMENT_WIDTH * input.viewCount;
  return input.width >= needed ? "segmented" : "select";
}

function detailsMode(input: AgendaShellInput): AgendaDetailsContainer {
  return input.details === "popover" && input.compact ? "drawer" : input.details;
}

/** The shell at a container width. */
export function resolveShellLayout(input: AgendaShellInput): AgendaShellLayout {
  return {
    sidebar: sidebarMode(input),
    switcher: switcherMode(input),
    details: detailsMode(input),
  };
}

/** The height of the block: `fill` takes what the page or container gives, else a CSS length. */
export interface AgendaHeight {
  fill: boolean;
  height?: string;
}

/** What the element laying the block out says, once mounted. */
export interface AgendaFillPlace {
  /** The page marks it as its filling block (`data-dms-page-fill`). */
  pageFill: boolean;
  /** It is a flex column (a drawer body), giving its height to the block. */
  flexColumn: boolean;
}

/** Where the block stands, for its height. */
export interface AgendaHeightSetting {
  /** The page fills the panel (`DefaultLayout({ fillHeight })`). */
  pageFills: boolean;
  /** In a drawer or a modal. */
  inContainer: boolean;
  /** `null` before it is mounted (and on the server). */
  place: AgendaFillPlace | null;
}

export const AGENDA_DEFAULT_HEIGHT = "44rem";
/** A container that gives no height (a modal body): as tall as the window lets it be. */
export const AGENDA_CONTAINER_HEIGHT = "min(44rem, calc(100dvh - 12rem))";
const FILL = "fill";

/** The attribute the page renderer puts on its filling block's wrapper. */
export const PAGE_FILL_ATTRIBUTE = "data-dms-page-fill";

/**
 * `height`, else `fill` on a page filling the panel, else 44rem. `fill`
 * takes the height of the page's filling block or of a drawer body;
 * elsewhere (a block above it, one inside a stack, a modal body) it falls
 * back to 44rem, bounded by the window in a container. Before it is mounted
 * the block fills, as the page's last block most often does.
 */
export function resolveAgendaHeight(
  height: string | undefined,
  setting: AgendaHeightSetting,
): AgendaHeight {
  const value = height ?? (setting.pageFills ? FILL : AGENDA_DEFAULT_HEIGHT);
  if (value !== FILL) return { fill: false, height: value };
  const { place } = setting;
  if (!place) return { fill: true };
  if (setting.inContainer)
    return place.flexColumn
      ? { fill: true }
      : { fill: false, height: AGENDA_CONTAINER_HEIGHT };
  return place.pageFill
    ? { fill: true }
    : { fill: false, height: AGENDA_DEFAULT_HEIGHT };
}

/** The element laying an element out: its parent, past `display: contents` wrappers (a permission veil). */
export function layoutParentOf(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent && getComputedStyle(parent).display === "contents")
    parent = parent.parentElement;
  return parent;
}

/** What the element laying the block out says about filling. */
export function fillPlaceOf(element: HTMLElement): AgendaFillPlace {
  const parent = layoutParentOf(element);
  if (!parent) return { pageFill: false, flexColumn: false };
  const style = getComputedStyle(parent);
  return {
    pageFill: parent.hasAttribute(PAGE_FILL_ATTRIBUTE),
    flexColumn:
      style.display.includes("flex") &&
      style.flexDirection.startsWith("column"),
  };
}

/** The calendars of a legend group, the ungrouped first. */
export interface AgendaLegendGroup {
  id: string;
  label?: AgendaCalendarGroup["label"];
  calendars: AgendaCalendar[];
}

/** The calendars by group, in the groups' order; a calendar of an unknown group goes with the ungrouped. */
export function legendGroups(
  calendars: AgendaCalendar[],
  groups: AgendaCalendarGroup[],
): AgendaLegendGroup[] {
  const known = new Set(groups.map((group) => group.id));
  const ungrouped = calendars.filter(
    (calendar) => !calendar.group || !known.has(calendar.group),
  );
  const result: AgendaLegendGroup[] = [];
  if (ungrouped.length) result.push({ id: "", calendars: ungrouped });
  for (const group of groups) {
    const members = calendars.filter((calendar) => calendar.group === group.id);
    if (members.length)
      result.push({ id: group.id, label: group.label, calendars: members });
  }
  return result;
}

const TONE_ORDER: Record<AgendaTone, number> = {
  error: 0,
  warning: 1,
  info: 2,
  primary: 3,
  success: 4,
  neutral: 5,
};
const DEFAULT_NOTICE_TONE: AgendaTone = "warning";

/** The tone of a notice or an issue (`warning` without one). */
export const noticeTone = (notice: Pick<AgendaNotice, "tone">): AgendaTone =>
  notice.tone ?? DEFAULT_NOTICE_TONE;

/** The notices, errors first, in their order within a tone. */
export function sortNotices(notices: AgendaNotice[]): AgendaNotice[] {
  return notices
    .map((notice, index) => ({ notice, index }))
    .sort(
      (a, b) =>
        TONE_ORDER[noticeTone(a.notice)] - TONE_ORDER[noticeTone(b.notice)] ||
        a.index - b.index,
    )
    .map(({ notice }) => notice);
}

/** A line of the sidebar's notices: an agenda notice, or an issue of an event (with its title). */
export interface AgendaNoticeItem {
  key: string;
  notice: AgendaNotice;
  eventTitle?: string;
}

/** The agenda's notices and its events' issues, errors first. */
export function noticeItems(
  notices: AgendaNotice[],
  occurrences: AgendaOccurrence[],
): AgendaNoticeItem[] {
  const issues: AgendaNotice[] = [];
  const titles = new Map<AgendaNotice, string>();
  for (const occurrence of occurrences) {
    for (const issue of occurrence.event.issues ?? []) {
      const notice: AgendaNotice = { ...issue, eventId: occurrence.key };
      issues.push(notice);
      titles.set(notice, occurrence.event.title);
    }
  }
  const keys = new Map<AgendaNotice, string>();
  [...notices, ...issues].forEach((notice, index) =>
    keys.set(notice, notice.id ?? `notice-${index}`),
  );
  return sortNotices([...notices, ...issues]).map((notice) => ({
    key: keys.get(notice) ?? "",
    notice,
    eventTitle: titles.get(notice),
  }));
}

export const AGENDA_UPCOMING_COUNT = 5;

/** The next occurrences not over at `now`, soonest first. */
export function upcomingOccurrences(
  occurrences: AgendaOccurrence[],
  now: number,
  count = AGENDA_UPCOMING_COUNT,
): AgendaOccurrence[] {
  return occurrences
    .filter((occurrence) => occurrence.end > now)
    .sort((a, b) => a.start - b.start)
    .slice(0, count);
}

/** The pending items matching a search, on their title and subtitle. */
export function matchesPending(
  item: { title: string; subtitle?: string },
  search: string,
): boolean {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return true;
  return `${item.title} ${item.subtitle ?? ""}`
    .toLocaleLowerCase()
    .includes(needle);
}

/** An attribute selector matching a value exactly (quotes and backslashes escaped). */
export function attributeSelector(name: string, value: string): string {
  return `[${name}="${value.replace(/["\\]/g, "\\$&")}"]`;
}
