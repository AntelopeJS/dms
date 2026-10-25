/**
 * A FullAgenda context without the engine: the shell, sidebar and details
 * tests drive the parts through it (width, details, staged changes) and
 * read what the parts asked of it (`apply`, `goTo`, `startPending`...).
 */
import { computed, ref } from "vue";
import { vi } from "vitest";
import type {
  AgendaContext,
  AgendaDropSurface,
  AgendaOccurrence,
  ResolvedAgendaOptions,
  ResolvedAgendaView,
} from "../../layers/dms-ui/app/build/composables/agenda/agendaModel";
import type {
  AgendaChange,
  AgendaEvent,
  AgendaViewType,
  FullAgendaOptions,
} from "../../layers/dms-ui/app/types/full-agenda";

export const FAKE_ZONE = "Europe/Brussels";
const COMPACT_BELOW = 640;
const MINUTES_PER_HOUR = 60;
const DAY_KEY_LENGTH = 10;

/** An occurrence of a timed event, painted plainly. */
export function fakeOccurrence(
  event: AgendaEvent,
  overrides: Partial<AgendaOccurrence> = {},
): AgendaOccurrence {
  const start = Date.parse(event.start);
  const end = Date.parse(event.end ?? event.start);
  return {
    key: event.id,
    event,
    allDay: Boolean(event.allDay),
    start,
    end,
    startDay: event.start.slice(0, DAY_KEY_LENGTH),
    endDay: (event.end ?? event.start).slice(0, DAY_KEY_LENGTH),
    startMinutes: 0,
    endMinutes: 0,
    resourceIds: event.resourceIds ?? [],
    paint: { background: "#eef", bar: "#33f", text: "#113", onBar: "#fff" },
    canMove: true,
    canResize: true,
    canDelete: true,
    details: "drawer",
    ...overrides,
  };
}

function view(type: AgendaViewType): ResolvedAgendaView {
  return {
    id: type,
    type,
    label: `dms.agenda.views.${type}`,
    hiddenDays: [],
    dayStart: "00:00",
    dayEnd: "24:00",
    slotMinutes: 30,
    duration: 7,
    scale: "hour",
    resourceLayout: "resourcesFirst",
    yearLayout: "planner",
  };
}

function resolvedOptions(raw: FullAgendaOptions): ResolvedAgendaOptions {
  const editable = raw.editable ?? Boolean(raw.saveUrl);
  return {
    raw,
    editable,
    dragMove: editable,
    dragResize: editable,
    canCreate: raw.create === false ? false : editable,
    createTrigger: "click",
    dayStartMinutes: 0,
    dayEndMinutes: 1440,
    slotMinutes: 30,
    snapMinutes: 15,
    hourHeight: 48,
    scrollMinutes: 8 * MINUTES_PER_HOUR,
    defaultDurationMinutes: 60,
    maxEventsPerDay: 3,
    weekStartsOn: 1,
    hiddenDays: [],
    timeZone: raw.timeZone ?? FAKE_ZONE,
    slots: [],
    businessHours: [],
    fields: raw.fields ?? [],
    eventActions: raw.eventActions ?? [],
    toolbarActions: raw.toolbarActions ?? [],
    urlState: false,
    shortcuts: false,
    compactBelow: raw.responsive?.compactBelow ?? COMPACT_BELOW,
  };
}

/** What a fake context records besides its state. */
export interface FakeAgenda {
  ctx: AgendaContext;
  surfaces: AgendaDropSurface[];
  applied: AgendaChange[];
}

/** A context over the static data of the options, `width` pixels wide. */
export function fakeAgendaContext(
  raw: FullAgendaOptions & { componentId?: string; pageId?: string },
  width = 1400,
): FakeAgenda {
  const surfaces: AgendaDropSurface[] = [];
  const applied: AgendaChange[] = [];
  const options = computed(() => resolvedOptions(raw));
  const views = computed(() =>
    (raw.views ?? ["month", "week", "day", "list"]).map((item) =>
      view(typeof item === "string" ? item : item.type),
    ),
  );
  const pickedViewId = ref(views.value[1]?.id ?? views.value[0]!.id);
  const widthRef = ref(width);
  const hiddenCalendars = ref(new Set<string>());
  const data = raw.staticData ?? { events: [] };
  const allOccurrences = computed(() =>
    data.events.map((event) =>
      fakeOccurrence(event, {
        calendar: (raw.calendars ?? data.calendars ?? []).find(
          (calendar) => calendar.id === event.calendarId,
        ),
      }),
    ),
  );
  const staged = ref<AgendaChange[]>([]);
  const ctx: AgendaContext = {
    componentId: raw.componentId ?? "agenda",
    pageId: raw.pageId ?? "page",
    options,
    format: {
      locale: computed(() => "en-GB"),
      time: (epoch) => new Date(epoch).toISOString().slice(11, 16),
      timeRange: (start, end) =>
        `${new Date(start).toISOString().slice(11, 16)} – ${end ? new Date(end).toISOString().slice(11, 16) : ""}`,
      day: (key, style) => `${style}:${key}`,
      month: (year, month) => `${year}-${month + 1}`,
      title: computed(() => "26 Oct – 1 Nov 2026"),
      duration: (minutes) => `${minutes} min`,
    },
    views,
    view: computed(
      () =>
        views.value.find((item) => item.id === pickedViewId.value) ??
        views.value[0]!,
    ),
    pickedViewId,
    setView: vi.fn((id: string) => {
      pickedViewId.value = id;
    }),
    anchor: ref("2026-10-26"),
    range: computed(() => ({
      from: "2026-10-26",
      to: "2026-11-01",
      days: [],
      start: 0,
      end: 0,
    })),
    today: computed(() => "2026-10-25"),
    go: vi.fn(),
    goToday: vi.fn(),
    goTo: vi.fn(),
    canGoPrevious: computed(() => true),
    canGoNext: computed(() => true),
    rootEl: ref(null),
    width: widthRef,
    compact: computed(() => widthRef.value < options.value.compactBelow),
    sidebarOpen: ref(true),
    loading: computed(() => false),
    error: computed(() => null),
    refresh: vi.fn(async () => {}),
    calendars: computed(() => raw.calendars ?? data.calendars ?? []),
    calendarGroups: computed(() => data.calendarGroups ?? []),
    resources: computed(() => raw.resources ?? data.resources ?? []),
    resourceGroups: computed(() => data.resourceGroups ?? []),
    foldedGroups: ref(new Set<string>()),
    toggleGroup: vi.fn(),
    backgrounds: computed(() => data.backgrounds ?? []),
    pending: computed(() => data.unscheduled ?? []),
    notices: computed(() => data.notices ?? []),
    occurrences: computed(() =>
      allOccurrences.value.filter(
        (occurrence) =>
          !occurrence.calendar ||
          !hiddenCalendars.value.has(occurrence.calendar.id),
      ),
    ),
    calendarCounts: computed(() => {
      const counts: Record<string, number> = {};
      for (const occurrence of allOccurrences.value) {
        const id = occurrence.event.calendarId;
        if (id) counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    }),
    hiddenCalendars,
    toggleCalendar: vi.fn((id: string) => {
      const next = new Set(hiddenCalendars.value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      hiddenCalendars.value = next;
    }),
    search: ref(""),
    facetValues: ref({}),
    hoursOn: () => [],
    drag: {
      preview: ref(null),
      active: computed(() => false),
      registerSurface: vi.fn((surface: AgendaDropSurface) => {
        surfaces.push(surface);
        return () => {};
      }),
      startOccurrence: vi.fn(),
      startEmpty: vi.fn(),
      startPending: vi.fn(),
      cancel: vi.fn(),
      nudge: vi.fn(() => false),
      announcement: ref(""),
      draggingKey: computed(() => null),
    },
    apply: vi.fn(async (change: AgendaChange) => {
      applied.push(change);
    }),
    staged: computed(() => staged.value),
    saving: computed(() => false),
    saveStaged: vi.fn(async () => {
      staged.value = [];
    }),
    discardStaged: vi.fn(() => {
      staged.value = [];
    }),
    rangeAnchor: ref(null),
    clickEmpty: vi.fn(),
    createAt: vi.fn(),
    remove: vi.fn(async () => {}),
    details: ref(null),
    open: vi.fn(),
    closeDetails: vi.fn(() => {
      ctx.details.value = null;
    }),
    runEventAction: vi.fn(),
    runToolbarAction: vi.fn(),
    focusedKey: ref(null),
    text: (value) => (typeof value === "string" ? value : ""),
    now: ref(Date.parse("2026-10-25T12:00:00Z")),
    hasData: computed(() => true),
    editable: computed(() => options.value.editable),
    liveMessage: ref(""),
    announce: vi.fn(),
    describe: (occurrence) => occurrence.event.title,
    createNew: vi.fn(),
    exportIcs: vi.fn(),
    stagedEdits: computed(() =>
      staged.value.map((change, index) => ({
        key: `edit-${index}`,
        change,
        status: "staged" as const,
      })),
    ),
    retry: vi.fn(async () => true),
    resolveConflict: vi.fn(async () => undefined),
  };
  // Tests stage changes through the context's own list.
  (ctx as AgendaContext & { stagedList: typeof staged }).stagedList = staged;
  return { ctx, surfaces, applied };
}

/** The writable list behind `ctx.staged`. */
export function stagedListOf(ctx: AgendaContext) {
  return (ctx as AgendaContext & { stagedList: { value: AgendaChange[] } })
    .stagedList;
}
