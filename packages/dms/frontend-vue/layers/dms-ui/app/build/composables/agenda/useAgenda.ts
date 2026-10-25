import {
  computed,
  inject,
  markRaw,
  provide,
  ref,
  watch,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from "vue";
import { useElementSize } from "@vueuse/core";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";
import { useUserRegionalPreferences } from "#dms-core/app/composables/user/useUserRegionalPreferences";
import { regionalFormatLocale } from "#dms-core/app/utils/regional";
import type { BlockText } from "#dms-core/app/types/composed-text";
import type { AgendaView, FullAgendaOptions } from "../../../types/full-agenda";
import type {
  AgendaContext,
  AgendaDragController,
  AgendaOccurrence,
} from "./agendaModel";
import { useConfirm } from "../../../composables/confirm/useConfirm";
import { useAgendaDrag } from "./useAgendaDrag";
import { resolveAgendaViews } from "./agendaRange";
import {
  DEFAULT_COMPACT_BELOW,
  isAgendaEditable,
  resolveAgendaOptions,
} from "./agendaOptions";
import { createAgendaFormat, type AgendaFormatSettings } from "./agendaFormat";
import { isTimeZone } from "./agendaTime";
import {
  useAgendaNavigation,
  type AgendaNavigation,
} from "./useAgendaNavigation";
import { useAgendaData, type AgendaDataSource } from "./useAgendaData";
import {
  useAgendaSave,
  useLiveMessage,
  type AgendaSaving,
} from "./useAgendaSave";
import {
  readInitialAgendaUrl,
  useAgendaFilterState,
} from "./useAgendaFilterState";
import { useAgendaInteractions } from "./useAgendaInteractions";
import { useAgendaOccurrences } from "./useAgendaOccurrences";
import {
  AGENDA_ROOT_ATTRIBUTE,
  useAgendaShortcuts,
} from "./useAgendaShortcuts";

const AGENDA_CONTEXT: InjectionKey<AgendaContext> = Symbol("dms-agenda");

/** The context of the agenda a part sits in (`useAgenda` provides it). */
export function useAgendaContext(): AgendaContext {
  const context = inject(AGENDA_CONTEXT);
  if (!context) throw new Error("An agenda part is used outside its block.");
  return context;
}

/** What the block hands `useAgenda`: its options and where it stands. */
export interface AgendaSetup extends FullAgendaOptions {
  componentId: string;
  pageId: string;
  routeParams?: Record<string, string>;
}

type TextOf = (value: BlockText | undefined) => string;

/** The reader's zone, week start and clock, under the block's own. */
function useReaderSettings(raw: FullAgendaOptions) {
  const preferences = useUserRegionalPreferences();
  const { locale } = useI18n();
  const timeZone = computed(() =>
    isTimeZone(raw.timeZone) ? raw.timeZone : preferences.timeZone.value,
  );
  const weekStartsOn = computed(
    () => raw.weekStartsOn ?? preferences.weekStartsOn.value,
  );
  const formatSettings = computed<AgendaFormatSettings>(() => ({
    locale: regionalFormatLocale(locale.value),
    timeZone: timeZone.value,
    hourCycle: preferences.timeFormat.value,
  }));
  return { timeZone, weekStartsOn, formatSettings };
}

/** A view's label: its own, else its type's name. */
function useViewLabel(text: TextOf) {
  const { t } = useI18n();
  return (view: AgendaView) => {
    if (view.label !== undefined) return text(view.label);
    const key = `dms.agenda.views.${view.type}`;
    const label = t(key);
    return label === key ? view.type : label;
  };
}

/** The agenda's root: its width (the container's, not the window's), compact below `compactBelow`. */
function useAgendaLayout(raw: FullAgendaOptions) {
  const rootEl = ref<HTMLElement | null>(null);
  const { width } = useElementSize(rootEl);
  const compactBelow = raw.responsive?.compactBelow ?? DEFAULT_COMPACT_BELOW;
  const compact = computed(() => width.value > 0 && width.value < compactBelow);
  watch(rootEl, (element) => element?.setAttribute(AGENDA_ROOT_ATTRIBUTE, ""));
  // A compact agenda folds its sidebar into an overlay, closed at first.
  const startsOpen = !(
    typeof raw.sidebar === "object" && raw.sidebar.collapsed
  );
  const sidebarOpen = ref(startsOpen);
  watch(compact, (isCompact) => (sidebarOpen.value = !isCompact && startsOpen));
  return { rootEl, width, compact, sidebarOpen };
}

/** The views, the range and the resolved options, the URL read once. */
function useAgendaFrame(props: AgendaSetup, text: TextOf) {
  const raw: FullAgendaOptions = props;
  const reader = useReaderSettings(raw);
  const layout = useAgendaLayout(raw);
  const labelOf = useViewLabel(text);
  const viewIds = resolveAgendaViews(raw.views, raw, labelOf).map(
    (view) => view.id,
  );
  const initialUrl = readInitialAgendaUrl(raw, props.componentId, viewIds, {
    view: "",
    date: "",
    search: "",
    facets: {},
    hidden: [],
  });
  const navigation = useAgendaNavigation({
    raw,
    timeZone: () => reader.timeZone.value,
    weekStartsOn: () => reader.weekStartsOn.value,
    compact: layout.compact,
    labelOf,
    initialViewId: initialUrl.state?.view || undefined,
    initialDay: initialUrl.state?.date || undefined,
  });
  const options = computed(() =>
    resolveAgendaOptions(raw, navigation.view.value, {
      timeZone: reader.timeZone.value,
      weekStartsOn: reader.weekStartsOn.value,
    }),
  );
  const format = createAgendaFormat({
    settings: () => reader.formatSettings.value,
    period: () => ({
      view: navigation.view.value,
      range: navigation.range.value,
      anchor: navigation.anchor.value,
    }),
  });
  return { raw, reader, layout, initialUrl, navigation, options, format };
}

/** Every part the context is made of. */
interface AgendaParts {
  props: AgendaSetup;
  frame: ReturnType<typeof useAgendaFrame>;
  state: ReturnType<typeof useAgendaFilterState>;
  source: AgendaDataSource;
  save: AgendaSaving;
  shown: ReturnType<typeof useAgendaOccurrences>;
  interactions: ReturnType<typeof useAgendaInteractions>;
  drag: AgendaDragController;
  focusedKey: Ref<string | null>;
  live: ReturnType<typeof useLiveMessage>;
  text: TextOf;
}

function navigationParts(navigation: AgendaNavigation) {
  return {
    views: navigation.views,
    view: navigation.view,
    pickedViewId: navigation.pickedViewId,
    setView: navigation.setView,
    anchor: navigation.anchor,
    range: navigation.range,
    today: navigation.today,
    go: navigation.go,
    goToday: navigation.goToday,
    goTo: navigation.goTo,
    canGoPrevious: navigation.canGoPrevious,
    canGoNext: navigation.canGoNext,
    now: navigation.now,
  };
}

/** The context, raw: a drawer's options are made deeply reactive, which would unwrap its refs. */
function buildContext(parts: AgendaParts): AgendaContext {
  const { frame, state, source, save, shown, interactions, live } = parts;
  return markRaw({
    componentId: parts.props.componentId,
    pageId: parts.props.pageId,
    options: frame.options,
    format: frame.format,
    ...navigationParts(frame.navigation),
    ...frame.layout,
    loading: source.isLoading,
    error: source.error,
    refresh: source.refresh,
    hasData: source.hasData,
    calendars: source.calendars,
    calendarGroups: source.calendarGroups,
    resourceGroups: source.resourceGroups,
    notices: computed(() => source.data.value.notices ?? []),
    ...shown,
    foldedGroups: state.foldedGroups,
    toggleGroup: state.toggleGroup,
    hiddenCalendars: state.hiddenCalendars,
    toggleCalendar: state.toggleCalendar,
    search: state.search,
    facetValues: state.facetValues,
    pending: save.pending,
    drag: parts.drag,
    apply: save.apply,
    staged: save.staged,
    saving: save.saving,
    saveStaged: save.saveStaged,
    discardStaged: save.discardStaged,
    stagedEdits: computed(() => save.engine.edits.value),
    retry: save.retry,
    resolveConflict: save.resolveConflict,
    editable: computed(() => isAgendaEditable(frame.raw)),
    ...interactions,
    focusedKey: parts.focusedKey,
    text: parts.text,
    liveMessage: live.message,
    announce: live.announce,
  });
}

/** Delete on a focused event asks first, as the details' Delete does. */
function useConfirmedRemove(
  remove: (occurrence: AgendaOccurrence) => Promise<void>,
) {
  const { confirm } = useConfirm();
  const { t } = useI18n();
  return async (occurrence: AgendaOccurrence) => {
    const isConfirmed = await confirm({
      title: t("dms.agenda.details.delete_title"),
      description: t("dms.agenda.details.delete_description", {
        title: occurrence.event.title,
      }),
      color: "error",
      confirmLabel: t("dms.agenda.details.delete"),
      initialFocus: "cancel",
    });
    if (isConfirmed) await remove(occurrence);
  };
}

/** The keyboard of the agenda, wired to its parts. */
function wireShortcuts(
  parts: AgendaParts,
  occurrences: ComputedRef<AgendaOccurrence[]>,
) {
  const { frame, save, interactions } = parts;
  const { navigation, raw } = frame;
  const confirmRemove = useConfirmedRemove(interactions.remove);
  useAgendaShortcuts({
    root: frame.layout.rootEl,
    enabled: () => frame.options.value.shortcuts,
    isStaged: () => raw.saveMode === "staged",
    views: () => navigation.views.value,
    occurrences: () => occurrences.value,
    focusedKey: parts.focusedKey,
    goToday: navigation.goToday,
    go: navigation.go,
    setView: navigation.setView,
    createNew: interactions.createNew,
    open: interactions.open,
    remove: (occurrence) => void confirmRemove(occurrence),
    saveStaged: () => void save.saveStaged(),
    hasStaged: () => save.staged.value.length > 0,
    cancel: () => {
      interactions.rangeAnchor.value = null;
      parts.drag.cancel();
    },
  });
}

/**
 * The FullAgenda block's state and behaviour, provided to its parts
 * (`useAgendaContext()`): the views and the range around the anchor day, in
 * the agenda's zone; the events read from `fetchUrl` or `staticData`,
 * normalized into occurrences (series expanded, changes not written laid
 * over them) and filtered by the legend, the search and the facets; editing
 * through the save engine; the drags; the details; the URL state and the
 * keyboard. `watchKey` is the state of the block's watch actions: a change
 * reads the events again.
 */
export function useAgenda(
  props: AgendaSetup,
  watchKey: () => string = () => "",
): AgendaContext {
  const { t } = useI18n();
  const { processText } = useComposedText();
  const text: TextOf = (value) =>
    value === undefined || value === "" ? "" : processText(value);
  const live = useLiveMessage();
  const frame = useAgendaFrame(props, text);
  const { raw, navigation, options } = frame;

  const state = useAgendaFilterState({
    raw,
    componentId: props.componentId,
    initial: frame.initialUrl,
    pickedViewId: navigation.pickedViewId,
    anchor: navigation.anchor,
    defaultViewId: navigation.defaultViewId,
    defaultDay: navigation.defaultDay,
  });
  const source = useAgendaData({
    raw,
    routeParams: () => props.routeParams,
    range: navigation.range,
    view: navigation.view,
    timeZone: () => options.value.timeZone,
    search: state.search,
    facetValues: state.facetValues,
    // Under `legend.serverFilter`, the route leaves the hidden calendars out.
    shownCalendarIds: () =>
      typeof raw.legend === "object" && raw.legend.serverFilter
        ? source.calendars.value
            .map((calendar) => calendar.id)
            .filter((id) => !state.hiddenCalendars.value.has(id))
        : undefined,
    watchKey,
  });
  state.follow({
    calendars: () => source.calendars.value,
    resourceGroups: () => source.resourceGroups.value,
  });
  const save = useAgendaSave({
    raw,
    options,
    routeParams: () => props.routeParams,
    source,
    range: navigation.range,
    view: navigation.view,
    text,
    announce: live.announce,
  });
  const shown = useAgendaOccurrences({
    options,
    range: navigation.range,
    source,
    overlay: save.overlay,
    facets: raw.facets ?? [],
    search: state.search,
    facetValues: state.facetValues,
    hiddenCalendars: state.hiddenCalendars,
  });
  const interactions = useAgendaInteractions({
    raw,
    componentId: props.componentId,
    pageId: props.pageId,
    options,
    range: navigation.range,
    viewId: () => navigation.view.value.id,
    today: navigation.today,
    now: navigation.now,
    compact: frame.layout.compact,
    format: frame.format,
    occurrences: shown.occurrences,
    resources: () => source.resources.value,
    isSettled: () => source.hasData.value && !source.isLoading.value,
    apply: save.apply,
    refresh: source.refresh,
    text,
    announce: live.announce,
  });
  const drag = useAgendaDrag({
    options,
    view: navigation.view,
    occurrences: shown.occurrences,
    resources: shown.resources,
    backgrounds: shown.backgrounds,
    hoursOn: shown.hoursOn,
    apply: save.apply,
    createAt: interactions.createAt,
    format: frame.format,
    t: (key, params) => t(key, params ?? {}),
  });

  const parts: AgendaParts = {
    props,
    frame,
    state,
    source,
    save,
    shown,
    interactions,
    drag,
    focusedKey: ref<string | null>(null),
    live,
    text,
  };
  wireShortcuts(parts, shown.occurrences);
  const context = buildContext(parts);
  provide(AGENDA_CONTEXT, context);
  return context;
}
