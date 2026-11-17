import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from "vue";
import { useElementSize } from "@vueuse/core";
import { useUserRegionalPreferences } from "../../../../../dms-core/app/composables/user/useUserRegionalPreferences";
import { regionalFormatLocale } from "../../../../../dms-core/app/utils/regional";
import type { BlockText } from "../../../../../dms-core/app/types/composed-text";
import type { AgendaView, FullAgendaOptions } from "../../../types/full-agenda";
import { resolveAgendaViews } from "./agendaRange";
import {
  DEFAULT_COMPACT_BELOW,
  optionObject,
  resolveAgendaOptions,
} from "./agendaOptions";
import { foldOnResize, type SidebarFold } from "./agendaShell";
import { createAgendaFormat, type AgendaFormatSettings } from "./agendaFormat";
import { isTimeZone } from "./agendaTime";
import { useAgendaNavigation } from "./useAgendaNavigation";
import { readInitialAgendaUrl } from "./useAgendaFilterState";
import { AGENDA_ROOT_ATTRIBUTE } from "./useAgendaShortcuts";

/** What the block hands `useAgenda`: its options and where it stands. */
export interface AgendaSetup extends FullAgendaOptions {
  componentId: string;
  pageId: string;
  routeParams?: Record<string, string>;
}

/** A text of the block as the reader reads it, empty for none. */
export type TextOf = (value: BlockText | undefined) => string;

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
  const compact = computed(
    () =>
      width.value > 0 &&
      width.value < (raw.responsive?.compactBelow ?? DEFAULT_COMPACT_BELOW),
  );
  watch(rootEl, (element) => element?.setAttribute(AGENDA_ROOT_ATTRIBUTE, ""));
  const sidebarOpen = ref(!optionObject(raw.sidebar)?.collapsed);
  keepSidebarFolded(raw, width, sidebarOpen);
  return {
    rootEl,
    width,
    compact,
    sidebarOpen,
    isMeasured: useMeasured(width),
  };
}

/** The column folds under `sidebar.foldBelow` and unfolds above it, as `foldOnResize` says. */
function keepSidebarFolded(
  raw: FullAgendaOptions,
  width: Ref<number>,
  open: Ref<boolean>,
): void {
  const below = optionObject(raw.sidebar)?.foldBelow;
  if (below === undefined) return;
  let fold: SidebarFold = {
    open: open.value,
    narrow: false,
    openBeforeNarrow: open.value,
  };
  watch(
    () => width.value > 0 && width.value < below,
    (narrow) => {
      fold = foldOnResize({ ...fold, open: open.value }, narrow);
      open.value = fold.open;
    },
    { immediate: true },
  );
}

const MEASURE_WAIT_MS = 150;

/**
 * Whether the agenda knows its width. A server render, and the browser
 * hydrating it, read at once (they render the same view); a client
 * navigation waits for the root to be measured (or a moment, for a root
 * that is not shown), so a narrow container reads its compact view once,
 * not the wide one first.
 */
function useMeasured(width: Ref<number>): Ref<boolean> {
  const isMeasured = ref(typeof window === "undefined" || isDmsHydrating());
  if (isMeasured.value) return isMeasured;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = watch(width, (value) => {
    if (value > 0) isMeasured.value = true;
  });
  onMounted(() => {
    timer = setTimeout(() => (isMeasured.value = true), MEASURE_WAIT_MS);
  });
  onBeforeUnmount(() => {
    clearTimeout(timer);
    stop();
  });
  return isMeasured;
}

/** The views, the range and the resolved options, the URL read once. */
export function useAgendaFrame(props: AgendaSetup, text: TextOf) {
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
