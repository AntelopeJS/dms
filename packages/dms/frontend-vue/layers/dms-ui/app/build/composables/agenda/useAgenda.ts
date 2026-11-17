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
import { useComposedText } from "../../../../../dms-core/app/composables/translation/useComposedText";
import type { AgendaDetailsTexts } from "../../../types/full-agenda";
import { useDeleteQuestion } from "./useAgendaDetails";
import { followRefresh } from "./agendaDetailsSync";
import { agendaActionRow } from "./agendaFormChanges";
import type { AgendaContext, AgendaOccurrence } from "./agendaModel";
import type { AgendaDragController } from "./agendaDragModel";
import { useConfirm } from "../../../composables/confirm/useConfirm";
import { useAgendaDrag } from "./useAgendaDrag";
import {
  useAgendaFrame,
  type AgendaSetup,
  type TextOf,
} from "./useAgendaFrame";

export type { AgendaSetup } from "./useAgendaFrame";
import { isAgendaEditable, optionObject } from "./agendaOptions";
import { toggleHiddenResource, togglePickedResource } from "./agendaFilters";
import { type AgendaNavigation } from "./useAgendaNavigation";
import { useAgendaData, type AgendaDataSource } from "./useAgendaData";
import {
  useAgendaSave,
  useLiveMessage,
  type AgendaSaving,
} from "./useAgendaSave";
import { useAgendaFilterState } from "./useAgendaFilterState";
import { useAgendaInteractions } from "./useAgendaInteractions";
import { useAgendaPropose } from "./useAgendaPropose";
import { useAgendaOccurrences } from "./useAgendaOccurrences";
import { useAgendaShortcuts, shortcutAction } from "./useAgendaShortcuts";

const AGENDA_CONTEXT: InjectionKey<AgendaContext> = Symbol.for("dms-agenda");

/** The context of the agenda a part sits in (`useAgenda` provides it). */
export function useAgendaContext(): AgendaContext {
  const context = inject(AGENDA_CONTEXT);
  if (!context) throw new Error("An agenda part is used outside its block.");
  return context;
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
    canGoToday: navigation.canGoToday,
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
    windowFailed: source.windowFailed,
    refresh: source.refresh,
    hasData: source.hasData,
    calendars: source.calendars,
    calendarGroups: source.calendarGroups,
    resourceGroups: source.resourceGroups,
    notices: computed(() => source.data.value.notices ?? []),
    fieldOptions: computed(() => source.data.value.fieldOptions ?? {}),
    ...shown,
    foldedGroups: state.foldedGroups,
    toggleGroup: state.toggleGroup,
    hiddenCalendars: state.hiddenCalendars,
    toggleCalendar: state.toggleCalendar,
    hiddenResources: shown.hiddenIds,
    toggleResource: (resourceId: string) => {
      const view = frame.navigation.view.value;
      if (view.resourcesAtOnce === undefined) {
        state.hiddenResources.value = toggleHiddenResource(
          state.hiddenResources.value,
          shown.resourceChoices.value,
          resourceId,
        );
        return;
      }
      state.resourcePicks.value = {
        ...state.resourcePicks.value,
        [view.id]: togglePickedResource(
          state.resourcePicks.value[view.id] ?? [],
          shown.resourceChoices.value,
          view.resourcesAtOnce,
          resourceId,
        ),
      };
    },
    resourcesAtOnce: computed(
      () => frame.navigation.view.value.resourcesAtOnce,
    ),
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
    saveStatus: save.saveStatus,
    sendableCount: save.sendableCount,
    lastRefusal: save.lastRefusal,
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
  texts: AgendaDetailsTexts | undefined,
) {
  const { confirm } = useConfirm();
  const { t } = useI18n();
  const deleteQuestion = useDeleteQuestion();
  return async (occurrence: AgendaOccurrence) => {
    const isConfirmed = await confirm({
      ...deleteQuestion(texts, occurrence.event),
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
  const confirmRemove = useConfirmedRemove(
    interactions.remove,
    raw.detailsTexts,
  );
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
    runShortcut: (key, occurrence) => {
      const row = agendaActionRow(occurrence, frame.options.value.timeZone);
      const action = shortcutAction(frame.options.value.eventActions, key, row);
      if (!action) return false;
      interactions.runEventAction(action, occurrence);
      return true;
    },
    cancel: () => {
      interactions.rangeAnchor.value = null;
      parts.drag.cancel();
    },
  });
}

/** The interactions of the agenda, and the details following the occurrences once they are read again. */
function useInteractionsPart(
  parts: Pick<
    AgendaParts,
    "props" | "frame" | "state" | "source" | "save" | "shown" | "live" | "text"
  >,
) {
  const { props, frame, state, source, save, shown, live, text } = parts;
  const { raw, navigation, options } = frame;
  const interactions = useAgendaInteractions({
    raw,
    componentId: props.componentId,
    pageId: props.pageId,
    options,
    range: navigation.range,
    viewId: () => navigation.view.value.id,
    today: navigation.today,
    now: navigation.now,
    format: frame.format,
    occurrences: shown.occurrences,
    resources: () => source.resources.value,
    openness: () => ({
      resourceIds: shown.resources.value.map((resource) => resource.id),
      backgrounds: shown.backgrounds.value,
    }),
    newEventCalendar: () =>
      optionObject(raw.create)?.calendarId ??
      source.calendars.value.find(
        (calendar) => !state.hiddenCalendars.value.has(calendar.id),
      )?.id,
    isSettled: () => source.hasData.value && !source.isLoading.value,
    apply: save.apply,
    refresh: source.refresh,
    text,
    announce: live.announce,
  });
  watch(shown.occurrences, (list) => {
    const loaded = source.isLoading.value
      ? undefined
      : new Set((source.data.value.events ?? []).map((event) => event.id));
    interactions.details.value = followRefresh(
      interactions.details.value,
      list,
      loaded,
    );
  });
  return interactions;
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
    hiddenCalendarIds: () =>
      optionObject(raw.legend)?.serverFilter
        ? state.hiddenCalendars.value
        : undefined,
    watchKey,
    isReady: () => frame.layout.isMeasured.value,
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
    hiddenResources: state.hiddenResources,
    resourcePicks: state.resourcePicks,
    view: navigation.view,
    now: navigation.now,
  });
  const interactions = useInteractionsPart({
    props,
    frame,
    state,
    source,
    save,
    shown,
    live,
    text,
  });
  useAgendaPropose({
    raw,
    timeZone: () => options.value.timeZone,
    goTo: (day) => navigation.goTo(day),
    createAt: interactions.createAt,
    text,
  });
  const drag = useAgendaDrag({
    options,
    view: navigation.view,
    occurrences: shown.occurrences,
    rangeOccurrences: shown.rangeOccurrences,
    range: navigation.range,
    anchor: navigation.anchor,
    calendars: source.calendars,
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
