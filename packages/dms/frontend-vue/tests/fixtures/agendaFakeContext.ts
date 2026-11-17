/**
 * A FullAgenda context without the engine: the shell, sidebar and details
 * tests drive the parts through it (width, details, staged changes) and
 * read what the parts asked of it (`apply`, `goTo`, `startPending`...).
 */
import { isString } from "../../layers/dms-core/app/utils/type-check";
import { computed, ref, type Ref } from "vue";
import { compactAgendaView } from "../../layers/dms-ui/app/entries/composables/agenda/agendaRange";
import { vi } from "vitest";
import type {
  AgendaContext,
  AgendaFormat,
  AgendaRefusal,
  AgendaStagedEdit,
  AgendaOccurrence,
  ResolvedAgendaOptions,
  ResolvedAgendaView,
} from "../../layers/dms-ui/app/entries/composables/agenda/agendaModel";
import type {
  AgendaDropSurface,
  AgendaPlanOutcome,
} from "../../layers/dms-ui/app/entries/composables/agenda/agendaDragModel";
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

/** What a fake context records besides its state, and the knobs a test turns. */
export interface FakeAgenda {
  ctx: AgendaContext;
  surfaces: AgendaDropSurface[];
  applied: AgendaChange[];
  /** What `apply` answers (`false`: the route refused). */
  applyResult: { value: boolean };
  dragActive: Ref<boolean>;
  error: Ref<unknown>;
  saveStatus: Ref<"idle" | "saving" | "saved" | "error">;
  /** `null`: every staged change is sendable. */
  sendable: Ref<number | null>;
  /** The status of each staged change, by its place (`staged` when absent). */
  statuses: Ref<AgendaStagedEdit["status"][]>;
  /** Today lies within `minDate`/`maxDate`. */
  canGoToday: Ref<boolean>;
  /** The range shown is not the one read: its read failed. */
  windowFailed: Ref<boolean>;
}

/** The format of a fake context: instants in UTC, days and months as keys. */
const FAKE_FORMAT: AgendaFormat = {
  locale: computed(() => "en-GB"),
  time: (epoch) => new Date(epoch).toISOString().slice(11, 16),
  timeRange: (start, end) =>
    `${new Date(start).toISOString().slice(11, 16)} – ${end ? new Date(end).toISOString().slice(11, 16) : ""}`,
  day: (key, style) => `${style}:${key}`,
  month: (year, month) => `${year}-${month + 1}`,
  title: computed(() => "26 Oct – 1 Nov 2026"),
  duration: (minutes) => `${minutes} min`,
};

/** The drag of a fake context: the surfaces registered are kept, nothing moves. */
function fakeDrag(
  surfaces: AgendaDropSurface[],
  dragActive: Ref<boolean>,
): AgendaContext["drag"] {
  return {
    preview: ref(null),
    active: computed(() => dragActive.value),
    registerSurface: vi.fn((surface: AgendaDropSurface) => {
      surfaces.push(surface);
      return () => {};
    }),
    startOccurrence: vi.fn(),
    startEmpty: vi.fn(),
    startPending: vi.fn(),
    cancel: vi.fn(),
    nudge: vi.fn(() => false),
    planPending: vi.fn(async (): Promise<AgendaPlanOutcome> => "planned"),
    announcement: ref(""),
    draggingKey: computed(() => null),
    refocusKey: ref<string | null>(null),
  };
}

/** The knobs and records of a fake context's saving. */
interface FakeSaveState {
  staged: Ref<AgendaChange[]>;
  applied: AgendaChange[];
  applyResult: { value: boolean };
  saveStatus: Ref<"idle" | "saving" | "saved" | "error">;
  sendable: Ref<number | null>;
  statuses: Ref<AgendaStagedEdit["status"][]>;
}

type FakeSaveFields =
  | "apply"
  | "staged"
  | "saving"
  | "saveStaged"
  | "discardStaged"
  | "stagedEdits"
  | "retry"
  | "resolveConflict"
  | "lastRefusal"
  | "saveStatus"
  | "sendableCount";

/** The saving of a fake context: changes kept as staged, applied ones recorded. */
function fakeSave(state: FakeSaveState): Pick<AgendaContext, FakeSaveFields> {
  const { staged, applied, applyResult, saveStatus, sendable, statuses } =
    state;
  return {
    apply: vi.fn(async (change: AgendaChange) => {
      if (!applyResult.value) return false;
      applied.push(change);
      return true;
    }),
    staged: computed(() => staged.value),
    saving: computed(() => false),
    saveStaged: vi.fn(async () => {
      staged.value = [];
    }),
    discardStaged: vi.fn(() => {
      staged.value = [];
    }),
    stagedEdits: computed(() =>
      staged.value.map((change, index) => ({
        key: `edit-${index}`,
        change,
        status: statuses.value[index] ?? "staged",
      })),
    ),
    retry: vi.fn(async () => true),
    resolveConflict: vi.fn(async () => true),
    lastRefusal: ref<AgendaRefusal | null>(null),
    saveStatus: computed(() => saveStatus.value),
    sendableCount: computed(() => sendable.value ?? staged.value.length),
  };
}

type FakeDataFields =
  | "calendars"
  | "calendarGroups"
  | "resources"
  | "resourceGroups"
  | "foldedGroups"
  | "toggleGroup"
  | "backgrounds"
  | "pending"
  | "notices"
  | "fieldOptions"
  | "occurrences"
  | "calendarCounts"
  | "hiddenCalendars"
  | "toggleCalendar"
  | "upcoming"
  | "occurrencesIn";

/** The data of a fake context: the options' static data as occurrences, the legend's hidden calendars applied. */
function fakeData(
  raw: FullAgendaOptions,
  hiddenCalendars: Ref<Set<string>>,
): Pick<AgendaContext, FakeDataFields> {
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
  return {
    calendars: computed(() => raw.calendars ?? data.calendars ?? []),
    calendarGroups: computed(() => data.calendarGroups ?? []),
    resources: computed(() => raw.resources ?? data.resources ?? []),
    resourceGroups: computed(() => data.resourceGroups ?? []),
    foldedGroups: ref(new Set<string>()),
    toggleGroup: vi.fn(),
    backgrounds: computed(() => data.backgrounds ?? []),
    pending: computed(() => data.unscheduled ?? []),
    notices: computed(() => data.notices ?? []),
    fieldOptions: computed(() => data.fieldOptions ?? {}),
    occurrences: computed(() =>
      allOccurrences.value.filter(
        (occurrence) =>
          !occurrence.calendar ||
          !hiddenCalendars.value.has(occurrence.calendar.id),
      ),
    ),
    calendarCounts: computed(() => {
      const counts = new Map<string, number>();
      for (const occurrence of allOccurrences.value) {
        const id = occurrence.event.calendarId;
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
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
    upcoming: computed(() => allOccurrences.value),
    occurrencesIn: (from: string, to: string) =>
      allOccurrences.value.filter(
        (occurrence) => occurrence.endDay >= from && occurrence.startDay <= to,
      ),
  };
}

/** The resource choices of a fake context: every resource the options list, none hidden. */
function fakeResources(raw: FullAgendaOptions) {
  return {
    resourceChoices: computed(
      () => raw.resources ?? raw.staticData?.resources ?? [],
    ),
    hiddenResources: computed(() => new Set<string>()),
    toggleResource: vi.fn(),
    resourcesAtOnce: computed(() => undefined),
  };
}

/** The writable list behind each fake context's `staged`. */
const STAGED_LISTS = new WeakMap<AgendaContext, Ref<AgendaChange[]>>();

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
      view(isString(item) ? item : item.type),
    ),
  );
  const pickedViewId = ref(views.value[1]?.id ?? views.value[0]!.id);
  const widthRef = ref(width);
  const hiddenCalendars = ref(new Set<string>());
  const staged = ref<AgendaChange[]>([]);
  const applyResult = { value: true };
  const dragActive = ref(false);
  const error = ref<unknown>(null);
  const windowFailed = ref(false);
  const saveStatus = ref<"idle" | "saving" | "saved" | "error">("idle");
  const sendable = ref<number | null>(null);
  const statuses = ref<AgendaStagedEdit["status"][]>([]);
  const canGoToday = ref(true);
  const ctx: AgendaContext = {
    componentId: raw.componentId ?? "agenda",
    pageId: raw.pageId ?? "page",
    options,
    format: FAKE_FORMAT,
    views,
    view: computed(() => {
      const picked =
        views.value.find((item) => item.id === pickedViewId.value) ??
        views.value[0]!;
      return widthRef.value < options.value.compactBelow
        ? compactAgendaView(picked, views.value, raw.responsive?.compactView)
        : picked;
    }),
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
    canGoToday: computed(() => canGoToday.value),
    rootEl: ref(null),
    width: widthRef,
    compact: computed(() => widthRef.value < options.value.compactBelow),
    sidebarOpen: ref(true),
    loading: computed(() => false),
    error: computed(() => error.value),
    windowFailed: computed(() => windowFailed.value),
    refresh: vi.fn(async () => {}),
    search: ref(""),
    facetValues: ref({}),
    ...fakeResources(raw),
    hoursOn: () => [],
    drag: fakeDrag(surfaces, dragActive),
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
    text: (value) => (isString(value) ? value : ""),
    now: ref(Date.parse("2026-10-25T12:00:00Z")),
    hasData: computed(() => true),
    editable: computed(() => options.value.editable),
    liveMessage: ref(""),
    announce: vi.fn(),
    describe: (occurrence) => occurrence.event.title,
    createNew: vi.fn(),
    exportIcs: vi.fn(),
    ...fakeSave({
      staged,
      applied,
      applyResult,
      saveStatus,
      sendable,
      statuses,
    }),
    ...fakeData(raw, hiddenCalendars),
  };
  STAGED_LISTS.set(ctx, staged);
  return {
    ctx,
    surfaces,
    applied,
    applyResult,
    dragActive,
    error,
    windowFailed,
    saveStatus,
    sendable,
    statuses,
    canGoToday,
  };
}

/** The writable list behind `ctx.staged`. */
export function stagedListOf(ctx: AgendaContext): Ref<AgendaChange[]> {
  const list = STAGED_LISTS.get(ctx);
  if (!list) throw new Error("the context is a fake agenda context");
  return list;
}

/** An occurrence that only the fields given tell apart: a short timed event otherwise. */
export const occurrenceStub = (
  overrides: Partial<AgendaOccurrence>,
): AgendaOccurrence =>
  fakeOccurrence(
    {
      id: overrides.key ?? "stub",
      title: "Stub",
      start: "2026-10-26T09:00:00Z",
      end: "2026-10-26T10:00:00Z",
    },
    overrides,
  );
