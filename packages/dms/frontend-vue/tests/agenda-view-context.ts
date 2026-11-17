import { computed, ref, shallowRef } from "vue";
import { vi } from "vitest";
import type {
  AgendaBackground,
  AgendaResource,
  AgendaResourceGroup,
  AgendaSlot,
} from "../layers/dms-ui/app/types/full-agenda";
import type {
  AgendaContext,
  AgendaDay,
  AgendaFormat,
  AgendaOccurrence,
  ResolvedAgendaOptions,
  ResolvedAgendaView,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaModel";
import { BRUSSELS } from "./agenda-view-fixtures";
import { fakeAgendaContext as fakeAgendaBase } from "./fixtures/agendaFakeContext";
import { isString } from "../layers/dms-core/app/utils/type-check";
import type { BlockText } from "../layers/dms-core/app/types/composed-text";

export interface FakeContextInput {
  days: AgendaDay[];
  view: Partial<ResolvedAgendaView>;
  occurrences?: AgendaOccurrence[];
  resources?: AgendaResource[];
  resourceGroups?: AgendaResourceGroup[];
  backgrounds?: AgendaBackground[];
  slots?: AgendaSlot[];
  today?: string;
  raw?: ResolvedAgendaOptions["raw"];
  /** The first answer is still on its way. */
  loading?: boolean;
}

const time = (epoch: number) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BRUSSELS,
  }).format(epoch);

const FORMAT: AgendaFormat = {
  locale: computed(() => "en-GB"),
  time,
  timeRange: (start, end) =>
    end === undefined ? time(start) : `${time(start)} – ${time(end)}`,
  day: (key, style) => `${style}:${key}`,
  month: (year, month) => `${year}-${month + 1}`,
  title: computed(() => "title"),
  duration: (minutes) => `${minutes} min`,
};

function fakeOptions(input: FakeContextInput): ResolvedAgendaOptions {
  return {
    raw: input.raw ?? {},
    editable: true,
    dragMove: true,
    dragResize: true,
    canCreate: true,
    createTrigger: "doubleClick",
    dayStartMinutes: 0,
    dayEndMinutes: 1440,
    slotMinutes: 30,
    snapMinutes: 15,
    hourHeight: 48,
    scrollMinutes: 480,
    defaultDurationMinutes: 60,
    maxEventsPerDay: 3,
    weekStartsOn: 1,
    hiddenDays: [],
    timeZone: BRUSSELS,
    slots: input.slots ?? [],
    businessHours: [],
    fields: [],
    eventActions: [],
    toolbarActions: [],
    urlState: false,
    shortcuts: false,
    compactBelow: 640,
  };
}

/** A context drawing `days` with the view given. */
export function fakeAgendaContext(input: FakeContextInput): AgendaContext {
  const days = input.days;
  const view: ResolvedAgendaView = {
    id: input.view.type ?? "timeline",
    type: "timeline",
    label: "View",
    hiddenDays: [],
    dayStart: "00:00",
    dayEnd: "24:00",
    slotMinutes: 30,
    duration: days.length,
    scale: "hour",
    resourceLayout: "resourcesFirst",
    yearLayout: "planner",
    ...input.view,
  };
  const folded = ref(new Set<string>());
  const base = fakeAgendaBase({ timeZone: BRUSSELS }).ctx;
  return {
    ...base,
    componentId: "agenda",
    options: computed(() => fakeOptions(input)),
    format: FORMAT,
    views: computed(() => [view]),
    view: computed(() => view),
    pickedViewId: ref(view.id),
    anchor: ref(days[0]!.key),
    range: computed(() => ({
      from: days[0]!.key,
      to: days.at(-1)!.key,
      days,
      start: days[0]!.start,
      end: days.at(-1)!.end,
    })),
    today: computed(() => input.today ?? "2026-10-25"),
    width: ref(1200),
    sidebarOpen: ref(false),
    loading: computed(() => Boolean(input.loading)),
    hasData: computed(() => !input.loading),
    calendars: computed(() => []),
    calendarGroups: computed(() => []),
    resources: computed(() => input.resources ?? []),
    resourceGroups: computed(() => input.resourceGroups ?? []),
    foldedGroups: folded,
    toggleGroup: vi.fn((id: string) => {
      const next = new Set(folded.value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      folded.value = next;
    }),
    backgrounds: computed(() => input.backgrounds ?? []),
    pending: computed(() => []),
    notices: computed(() => []),
    occurrences: computed(() => input.occurrences ?? []),
    calendarCounts: computed(() => new Map<string, number>()),
    drag: {
      ...base.drag,
      preview: shallowRef(null),
      active: computed(() => false),
      registerSurface: vi.fn(() => () => {}),
      draggingKey: computed(() => null),
      refocusKey: ref(null),
    },
    text: (value) => (value === undefined ? "" : processedText(value)),
    now: ref(Date.parse("2026-10-25T10:00:00+01:00")),
    editable: computed(() => true),
  };
}

/** A text of the agenda as these tests read it: a plain string as it is, anything else empty. */
const processedText = (value: BlockText): string =>
  isString(value) ? value : "";
