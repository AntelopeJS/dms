// A fake `AgendaContext` for the timeline, year and list view tests: the
// values a view reads, with spies on what it calls.

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
} from "../layers/dms-ui/app/build/composables/agenda/agendaModel";
import { BRUSSELS } from "./agenda-view-fixtures";

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
  return {
    componentId: "agenda",
    pageId: "page",
    options: computed(() => fakeOptions(input)),
    format: FORMAT,
    views: computed(() => [view]),
    view: computed(() => view),
    pickedViewId: ref(view.id),
    setView: vi.fn(),
    anchor: ref(days[0]!.key),
    range: computed(() => ({
      from: days[0]!.key,
      to: days.at(-1)!.key,
      days,
      start: days[0]!.start,
      end: days.at(-1)!.end,
    })),
    today: computed(() => input.today ?? "2026-10-25"),
    go: vi.fn(),
    goToday: vi.fn(),
    goTo: vi.fn(),
    canGoPrevious: computed(() => true),
    canGoNext: computed(() => true),
    rootEl: ref(null),
    width: ref(1200),
    compact: computed(() => false),
    sidebarOpen: ref(false),
    loading: computed(() => false),
    error: computed(() => null),
    refresh: vi.fn(async () => {}),
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
    calendarCounts: computed(() => ({})),
    hiddenCalendars: ref(new Set()),
    toggleCalendar: vi.fn(),
    search: ref(""),
    facetValues: ref({}),
    hoursOn: () => [],
    drag: {
      preview: shallowRef(null),
      active: computed(() => false),
      registerSurface: vi.fn(() => () => {}),
      startOccurrence: vi.fn(),
      startEmpty: vi.fn(),
      startPending: vi.fn(),
      cancel: vi.fn(),
      nudge: vi.fn(() => false),
      announcement: ref(""),
      draggingKey: ref(null),
    },
    apply: vi.fn(async () => {}),
    staged: computed(() => []),
    saving: computed(() => false),
    saveStaged: vi.fn(async () => {}),
    discardStaged: vi.fn(),
    rangeAnchor: ref(null),
    clickEmpty: vi.fn(),
    createAt: vi.fn(),
    remove: vi.fn(async () => {}),
    details: ref(null),
    open: vi.fn(),
    closeDetails: vi.fn(),
    runEventAction: vi.fn(),
    runToolbarAction: vi.fn(),
    focusedKey: ref(null),
    text: (value: unknown) => (value === undefined ? "" : String(value)),
    now: ref(Date.parse("2026-10-25T10:00:00+01:00")),
    editable: computed(() => true),
    announce: vi.fn(),
    describe: (occurrence: AgendaOccurrence) => occurrence.event.title,
  } as unknown as AgendaContext;
}
