import { ComponentBuilder } from "../component";
import { z } from "zod";
import {
  type BlockOptionsFor,
  opaqueOption,
  RegisterBlockType,
  ui,
} from "./block-registry";
import { blockPeriodScopeOption, blockRealtimeTopicOption } from "./display";
import { attachRealtimeTopicsHook } from "./internal/realtime-topics";
import type {
  AgendaBusinessHours,
  AgendaCalendar,
  AgendaConstraints,
  AgendaCreate,
  AgendaData,
  AgendaDetails,
  AgendaEventActionSerialized,
  AgendaEventContent,
  AgendaFacet,
  AgendaField,
  AgendaLegend,
  AgendaResource,
  AgendaResponsive,
  AgendaSidebar,
  AgendaSlot,
  AgendaToolbar,
  AgendaToolbarActionSerialized,
  AgendaUnscheduled,
  AgendaView,
  AgendaViewType,
  FullAgendaProps,
  FullAgendaPropsSerialized,
} from "./full-agenda-types";
import type { ActionTargetSerialized } from "./types/action-target";
import { serializeActionTarget } from "./types/internal/action-target";
import type { BlockText } from "./types/composed-text";
import { HttpMethod } from "./types/http";

const FULL_AGENDA_COMPONENT_NAME = "dms-full-agenda-block";
const DEFAULT_ICON = "i-ph-calendar-dots";

/**
 * A calendar of events by month, week, day, list, year, resource columns or
 * resource timeline, moved and resized by dragging, with a sidebar (mini
 * calendar, legend, pending items to drag in) and the details of an event in
 * a drawer, a panel, a modal or a popover. It fills a full page, sits in a
 * boxed one, in a grid column or in a modal, and adapts to the width it is
 * given. `options` is optional so a page under construction may write the
 * bare call `FullAgenda()`.
 */
export function FullAgenda(
  options?: FullAgendaProps,
): ComponentBuilder<FullAgendaPropsSerialized> {
  const { selectAction, eventAction, eventActions, toolbarActions, ...rest } =
    options ?? {};
  const serialized: FullAgendaPropsSerialized = {
    ...rest,
    ...(selectAction && { selectAction: serializeActionTarget(selectAction) }),
    ...(eventAction && { eventAction: serializeActionTarget(eventAction) }),
    ...(eventActions && {
      eventActions: eventActions.map((action) => ({
        ...action,
        target: serializeActionTarget(action.target),
      })),
    }),
    ...(toolbarActions && {
      toolbarActions: toolbarActions.map((action) => ({
        ...action,
        target: serializeActionTarget(action.target),
      })),
    }),
  };
  return attachRealtimeTopicsHook(
    new ComponentBuilder<FullAgendaPropsSerialized>(FULL_AGENDA_COMPONENT_NAME)
      .options(serialized)
      .meta({ name: "Full agenda", icon: DEFAULT_ICON }),
    options?.realtimeTopic,
  );
}

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-4]):[0-5]\d$/, "A time of day, HH:MM");

/** The options `FullAgenda` accepts. */
export const FullAgendaSchema = z.object({
  title: ui(opaqueOption<BlockText>().optional(), {
    label: "Title",
    group: "content",
  }),
  description: ui(opaqueOption<BlockText>().optional(), {
    label: "Description",
    group: "content",
  }),
  fetchUrl: ui(
    z.string().optional().describe("Where the events are read from."),
    { label: "Data source", group: "data", widget: "dataSource" },
  ),
  fetchUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "HTTP method",
    group: "advanced",
    widget: "select",
  }),
  realtimeTopic: blockRealtimeTopicOption(),
  staticData: ui(opaqueOption<AgendaData>().optional(), {
    label: "Static data",
    group: "advanced",
    widget: "json",
  }),
  periodScope: blockPeriodScopeOption(),
  saveUrl: ui(z.string().optional().describe("Where changes are written."), {
    label: "Save route",
    group: "data",
    widget: "url",
  }),
  saveUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "Save method",
    group: "advanced",
    widget: "select",
  }),
  views: ui(opaqueOption<(AgendaViewType | AgendaView)[]>().optional(), {
    label: "Views",
    group: "appearance",
    widget: "json",
  }),
  initialView: ui(z.string().optional(), {
    label: "First view",
    group: "appearance",
    widget: "text",
  }),
  initialDate: ui(z.string().optional(), {
    label: "First day",
    group: "data",
    widget: "text",
  }),
  minDate: ui(z.string().optional(), {
    label: "Earliest day",
    group: "behavior",
    widget: "text",
  }),
  maxDate: ui(z.string().optional(), {
    label: "Latest day",
    group: "behavior",
    widget: "text",
  }),
  weekStartsOn: ui(
    z.union([z.literal(0), z.literal(1), z.literal(6)]).optional(),
    { label: "Week starts on", group: "appearance", widget: "json" },
  ),
  hiddenDays: ui(z.array(z.number().int().min(0).max(6)).optional(), {
    label: "Hidden days",
    group: "appearance",
    widget: "json",
  }),
  timeZone: ui(z.string().optional(), {
    label: "Time zone",
    group: "advanced",
    widget: "text",
  }),
  calendars: ui(opaqueOption<AgendaCalendar[]>().optional(), {
    label: "Calendars",
    group: "data",
    widget: "json",
  }),
  resources: ui(opaqueOption<AgendaResource[]>().optional(), {
    label: "Resources",
    group: "data",
    widget: "json",
  }),
  slots: ui(opaqueOption<AgendaSlot[]>().optional(), {
    label: "Named slots",
    group: "appearance",
    widget: "json",
  }),
  businessHours: ui(opaqueOption<AgendaBusinessHours[]>().optional(), {
    label: "Opening hours",
    group: "appearance",
    widget: "json",
  }),
  dayStart: ui(timeOfDay.optional(), {
    label: "Day starts at",
    group: "appearance",
    widget: "text",
  }),
  dayEnd: ui(timeOfDay.optional(), {
    label: "Day ends at",
    group: "appearance",
    widget: "text",
  }),
  slotMinutes: ui(z.number().int().min(5).max(240).optional(), {
    label: "Grid line every (min)",
    group: "appearance",
    widget: "number",
    min: 5,
  }),
  snapMinutes: ui(z.number().int().min(1).max(240).optional(), {
    label: "Snap to (min)",
    group: "behavior",
    widget: "number",
    min: 1,
  }),
  hourHeight: ui(z.number().int().min(16).max(240).optional(), {
    label: "Hour height (px)",
    group: "appearance",
    widget: "number",
    min: 16,
  }),
  scrollTime: ui(timeOfDay.optional(), {
    label: "Scroll to",
    group: "appearance",
    widget: "text",
  }),
  nowIndicator: ui(z.boolean().optional(), {
    label: "Current time line",
    group: "appearance",
    widget: "switch",
  }),
  allDayRow: ui(z.boolean().optional(), {
    label: "All-day row",
    group: "appearance",
    widget: "switch",
  }),
  weekNumbers: ui(z.boolean().optional(), {
    label: "Week numbers",
    group: "appearance",
    widget: "switch",
  }),
  overlap: ui(z.enum(["columns", "stack"]).optional(), {
    label: "Overlapping events",
    group: "appearance",
    widget: "segmented",
  }),
  maxEventsPerDay: ui(z.number().int().min(1).optional(), {
    label: "Events per day (month)",
    group: "appearance",
    widget: "number",
    min: 1,
  }),
  resourceAreaWidth: ui(z.number().int().min(80).optional(), {
    label: "Resource column width (px)",
    group: "appearance",
    widget: "number",
    min: 80,
  }),
  columnMinWidth: ui(z.number().int().min(24).optional(), {
    label: "Minimum column width (px)",
    group: "appearance",
    widget: "number",
    min: 24,
  }),
  defaultDurationMinutes: ui(z.number().int().min(1).optional(), {
    label: "Default length (min)",
    group: "behavior",
    widget: "number",
    min: 1,
  }),
  eventContent: ui(opaqueOption<AgendaEventContent>().optional(), {
    label: "Event content",
    group: "appearance",
    widget: "json",
  }),
  tooltips: ui(z.boolean().optional(), {
    label: "Tooltips",
    group: "appearance",
    widget: "switch",
  }),
  editable: ui(z.boolean().optional(), {
    label: "Editable",
    group: "behavior",
    widget: "switch",
  }),
  dragMove: ui(z.boolean().optional(), {
    label: "Drag to move",
    group: "behavior",
    widget: "switch",
  }),
  dragResize: ui(z.boolean().optional(), {
    label: "Drag to resize",
    group: "behavior",
    widget: "switch",
  }),
  copyOnAltDrag: ui(z.boolean().optional(), {
    label: "Alt + drag copies",
    group: "behavior",
    widget: "switch",
  }),
  create: ui(opaqueOption<boolean | AgendaCreate>().optional(), {
    label: "Create events",
    group: "behavior",
    widget: "json",
  }),
  rangeSelect: ui(z.enum(["drag", "twoClicks"]).optional(), {
    label: "Range selection",
    group: "behavior",
    widget: "segmented",
  }),
  selectAction: ui(opaqueOption<ActionTargetSerialized>().optional(), {
    label: "Range action",
    group: "behavior",
    widget: "json",
  }),
  constraints: ui(opaqueOption<AgendaConstraints>().optional(), {
    label: "Constraints",
    group: "behavior",
    widget: "json",
  }),
  saveMode: ui(z.enum(["immediate", "staged"]).optional(), {
    label: "Save mode",
    group: "behavior",
    widget: "segmented",
  }),
  review: ui(z.boolean().optional(), {
    label: "Review before saving",
    group: "behavior",
    widget: "switch",
  }),
  undoSeconds: ui(z.number().int().min(0).optional(), {
    label: "Undo window (s)",
    group: "behavior",
    widget: "number",
    min: 0,
  }),
  conflicts: ui(z.enum(["overwrite", "detect"]).optional(), {
    label: "Conflicts",
    group: "behavior",
    widget: "segmented",
  }),
  recurringEdit: ui(z.enum(["ask", "occurrence", "series"]).optional(), {
    label: "Editing a recurring event",
    group: "behavior",
    widget: "segmented",
  }),
  fields: ui(opaqueOption<AgendaField[]>().optional(), {
    label: "Details fields",
    group: "data",
    widget: "json",
  }),
  details: ui(opaqueOption<AgendaDetails>().optional(), {
    label: "Details",
    group: "features",
    widget: "json",
  }),
  eventAction: ui(opaqueOption<ActionTargetSerialized>().optional(), {
    label: "Event click action",
    group: "behavior",
    widget: "json",
  }),
  eventActions: ui(opaqueOption<AgendaEventActionSerialized[]>().optional(), {
    label: "Event actions",
    group: "features",
    widget: "json",
  }),
  toolbarActions: ui(
    opaqueOption<AgendaToolbarActionSerialized[]>().optional(),
    { label: "Toolbar actions", group: "features", widget: "json" },
  ),
  toolbar: ui(opaqueOption<boolean | AgendaToolbar>().optional(), {
    label: "Toolbar",
    group: "features",
    widget: "json",
  }),
  sidebar: ui(opaqueOption<boolean | AgendaSidebar>().optional(), {
    label: "Sidebar",
    group: "features",
    widget: "json",
  }),
  legend: ui(opaqueOption<boolean | AgendaLegend>().optional(), {
    label: "Legend",
    group: "features",
    widget: "json",
  }),
  unscheduled: ui(opaqueOption<AgendaUnscheduled>().optional(), {
    label: "Pending items",
    group: "features",
    widget: "json",
  }),
  search: ui(z.boolean().optional(), {
    label: "Search",
    group: "features",
    widget: "switch",
  }),
  facets: ui(opaqueOption<AgendaFacet[]>().optional(), {
    label: "Facets",
    group: "features",
    widget: "json",
  }),
  urlState: ui(z.boolean().optional(), {
    label: "Keep state in the URL",
    group: "behavior",
    widget: "switch",
  }),
  shortcuts: ui(z.boolean().optional(), {
    label: "Keyboard shortcuts",
    group: "behavior",
    widget: "switch",
  }),
  height: ui(z.string().optional(), {
    label: "Height",
    group: "appearance",
    widget: "text",
  }),
  responsive: ui(opaqueOption<AgendaResponsive>().optional(), {
    label: "Narrow container",
    group: "appearance",
    widget: "json",
  }),
  emptyLabel: ui(opaqueOption<BlockText>().optional(), {
    label: "Empty message",
    group: "content",
  }),
  density: ui(z.enum(["compact", "comfortable"]).optional(), {
    label: "Density",
    group: "appearance",
    widget: "segmented",
  }),
}) satisfies BlockOptionsFor<FullAgendaPropsSerialized>;

RegisterBlockType({
  type: "FullAgenda",
  componentName: FULL_AGENDA_COMPONENT_NAME,
  schema: FullAgendaSchema,
  meta: {
    name: "Full agenda",
    icon: DEFAULT_ICON,
    description:
      "A calendar by month, week, day, list, year or resource, edited by dragging, with a sidebar and event details.",
    group: "data",
  },
});
