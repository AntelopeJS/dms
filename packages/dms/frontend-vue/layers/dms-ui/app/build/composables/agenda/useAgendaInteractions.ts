import { onMounted, ref, watch, type ComputedRef, type Ref } from "vue";
import type { BlockText } from "#dms-core/app/types/composed-text";
import type {
  AgendaChange,
  AgendaDetailsContainer,
  AgendaEventAction,
  AgendaResource,
  AgendaToolbarAction,
  FullAgendaOptions,
} from "../../../types/full-agenda";
import type { ActionTarget } from "../../../composables/table-view/types/action-target";
import { useActionTargets } from "../actions/useActionTargets";
import type {
  AgendaContext,
  AgendaDetailsState,
  AgendaDropTarget,
  AgendaFormat,
  AgendaOccurrence,
  AgendaPlacement,
  AgendaRange,
  AgendaRangeAnchor,
  ResolvedAgendaOptions,
} from "./agendaModel";
import { agendaActionRow, isOccurrenceEditable } from "./agendaForm";
import {
  agendaEventUrlKey,
  readAgendaUrlEvent,
  writeAgendaUrlEntries,
} from "./agendaUrlState";
import { exportAgendaIcs } from "./agendaIcs";
import { describeOccurrence } from "./agendaDescribe";
import {
  newEventPlacement,
  placementOfDays,
  placementOfTarget,
  placementRow,
} from "./agendaPlacement";

const A11Y_PREFIX = "dms.agenda.a11y";

export interface AgendaInteractionSetup {
  raw: FullAgendaOptions;
  componentId: string;
  pageId: string;
  options: ComputedRef<ResolvedAgendaOptions>;
  range: ComputedRef<AgendaRange>;
  /** The id of the view drawn (`{{row.view}}` of a toolbar action). */
  viewId: () => string;
  today: ComputedRef<string>;
  now: Ref<number>;
  format: AgendaFormat;
  occurrences: ComputedRef<AgendaOccurrence[]>;
  resources: () => AgendaResource[];
  /** The calendar a new event starts in: `create.calendarId`, else the first shown. */
  newEventCalendar: () => string | undefined;
  /** The data was read once and no read runs: a deep-linked event missing is gone. */
  isSettled: () => boolean;
  apply: AgendaContext["apply"];
  refresh: () => Promise<void>;
  text: (value: BlockText | undefined) => string;
  announce: (message: string) => void;
}

type RunTarget = (
  target: ActionTarget,
  label: string,
  row: Record<string, unknown>,
  icon?: string,
) => void;

/** The targets the agenda runs (event, toolbar and select actions), `{{row.X}}` filled. */
function useTargetRunner(setup: AgendaInteractionSetup): RunTarget {
  const { handleCustomRowAction } = useActionTargets({
    api: useAuthFetch().$authFetch,
    componentId: setup.componentId,
    pageId: setup.pageId,
    refreshCallback: () => void setup.refresh(),
    handleApiError: (error, title) => useApiError(error, { title }),
    rowIdKey: "id",
  });
  return (target, label, row, icon) =>
    handleCustomRowAction({ label, icon, target }, row);
}

/** What creating shares with the rest of the interactions. */
interface AgendaCreateParts {
  details: Ref<AgendaDetailsState | null>;
  runTarget: RunTarget;
  containerFor: (container: AgendaDetailsContainer) => AgendaDetailsContainer;
}

/**
 * Creating: a click (or a double click) on an empty spot, a `twoClicks`
 * range of days, the toolbar's "+ New"; each opens the form of a new event,
 * or `selectAction` with the placement as `{{row.X}}`.
 */
function useAgendaCreate(
  setup: AgendaInteractionSetup,
  parts: AgendaCreateParts,
) {
  const { raw, options } = setup;
  const { t } = useI18n();
  const rangeAnchor = ref<AgendaRangeAnchor | null>(null);
  const timeZone = () => options.value.timeZone;

  function createAt(placement: AgendaPlacement): void {
    rangeAnchor.value = null;
    if (raw.selectAction) {
      parts.runTarget(
        raw.selectAction,
        t(`${A11Y_PREFIX}.new_event`),
        placementRow(placement, timeZone()),
      );
      return;
    }
    if (!options.value.canCreate) return;
    parts.details.value = {
      occurrence: null,
      placement,
      calendarId: setup.newEventCalendar(),
      mode: "edit",
      container: parts.containerFor(raw.details?.container ?? "drawer"),
    };
  }

  const isReadOnlyResource = (resourceId: string | undefined) =>
    Boolean(
      resourceId &&
        setup.resources().find((resource) => resource.id === resourceId)
          ?.editable === false,
    );
  const canPick = () => options.value.canCreate || Boolean(raw.selectAction);

  /** A `twoClicks` range: the first day waits for the second, which opens the range. */
  function pickRangeDay(target: AgendaDropTarget, double: boolean): void {
    if (double) return;
    const first = rangeAnchor.value;
    if (first) {
      createAt(placementOfDays(first, target, timeZone()));
      return;
    }
    rangeAnchor.value = {
      day: target.day,
      resourceId: target.unassigned ? undefined : target.resourceId,
    };
    setup.announce(
      t(`${A11Y_PREFIX}.range_started`, {
        day: setup.format.day(target.day, "long"),
      }),
    );
  }

  function clickEmpty(target: AgendaDropTarget, double: boolean): void {
    if (target.pending || !canPick() || isReadOnlyResource(target.resourceId))
      return;
    if (raw.rangeSelect === "twoClicks") return pickRangeDay(target, double);
    const trigger = options.value.createTrigger;
    if (trigger === "drag" || (trigger === "doubleClick") !== double) return;
    createAt(placementOfTarget(target, options.value));
  }

  function createNew(): void {
    if (!canPick()) return;
    createAt(
      newEventPlacement(
        setup.range.value,
        setup.today.value,
        setup.now.value,
        options.value,
      ),
    );
  }

  return { rangeAnchor, createAt, clickEmpty, createNew };
}

/**
 * What the agenda does on a click: open an event (its details, or
 * `eventAction`), create one (see `useAgendaCreate`), remove one, run the
 * event and toolbar actions, export the range; the open event kept in the
 * URL (`<componentId>.event`) and opened again on load.
 */
export function useAgendaInteractions(setup: AgendaInteractionSetup) {
  const { raw, options } = setup;
  const { t } = useI18n();
  const details = ref<AgendaDetailsState | null>(null);
  const timeZone = () => options.value.timeZone;
  const isDeepLinked =
    raw.details?.deepLink !== false && raw.urlState !== false;
  const runTarget = useTargetRunner(setup);
  // The container asked for is kept: the shell draws a panel as a drawer
  // while the agenda is narrow, and as a panel again once it widens.
  const containerFor = (container: AgendaDetailsContainer) => container;
  const create = useAgendaCreate(setup, { details, runTarget, containerFor });

  const writeOpenEvent = (key?: string) => {
    if (isDeepLinked)
      writeAgendaUrlEntries({ [agendaEventUrlKey(setup.componentId)]: key });
  };

  function open(occurrence: AgendaOccurrence): void {
    if (raw.eventAction) {
      const row = agendaActionRow(occurrence, timeZone());
      runTarget(raw.eventAction, occurrence.event.title, row);
      return;
    }
    if (occurrence.details === false) return;
    const direct =
      raw.details?.editDirectly === true &&
      isOccurrenceEditable(occurrence, options.value.editable);
    details.value = {
      occurrence,
      mode: direct ? "edit" : "view",
      container: containerFor(occurrence.details),
    };
    writeOpenEvent(occurrence.key);
  }

  function closeDetails(): void {
    if (!details.value) return;
    details.value = null;
    writeOpenEvent(undefined);
  }

  async function remove(occurrence: AgendaOccurrence): Promise<void> {
    if (!occurrence.canDelete) return;
    const change: AgendaChange = {
      kind: "delete",
      id: occurrence.recurring?.seriesId ?? occurrence.event.id,
      ...(occurrence.recurring && {
        occurrence: occurrence.recurring.occurrence,
      }),
    };
    if (details.value?.occurrence?.key === occurrence.key) closeDetails();
    await setup.apply(change, occurrence);
  }

  const runEventAction = (
    action: AgendaEventAction,
    occurrence: AgendaOccurrence,
  ) => {
    const row = agendaActionRow(occurrence, timeZone());
    runTarget(action.target, setup.text(action.label), row, action.icon);
  };
  const runToolbarAction = (action: AgendaToolbarAction) => {
    const { from, to } = setup.range.value;
    const row = { from, to, view: setup.viewId() };
    runTarget(action.target, setup.text(action.label), row, action.icon);
  };
  const calendarLabel = (occurrence: AgendaOccurrence) =>
    occurrence.calendar ? setup.text(occurrence.calendar.label) : "";

  if (isDeepLinked) reopenLinkedEvent(setup, open, writeOpenEvent);

  return {
    details,
    ...create,
    open,
    closeDetails,
    remove,
    runEventAction,
    runToolbarAction,
    exportIcs: () =>
      exportAgendaIcs(setup.occurrences.value, {
        name: setup.text(raw.title),
        range: setup.range.value,
        calendarLabel,
      }),
    describe: (occurrence: AgendaOccurrence) =>
      describeOccurrence(occurrence, {
        format: setup.format,
        t: (key, params) => t(key, params ?? {}),
        calendarLabel,
      }),
  };
}

/**
 * The event the URL names opens once the occurrences are there; one the
 * first settled read does not show (gone, filtered out) leaves the URL.
 */
function reopenLinkedEvent(
  setup: AgendaInteractionSetup,
  open: (occurrence: AgendaOccurrence) => void,
  write: (key?: string) => void,
): void {
  let linked = readAgendaUrlEvent(
    useDmsRoute().query as Record<string, string>,
    setup.componentId,
  );
  onMounted(() => {
    if (!linked) return;
    watch(
      [() => setup.occurrences.value, () => setup.isSettled()],
      ([occurrences, isSettled]) => {
        if (!linked) return;
        const key = linked;
        const found = occurrences.find(
          (entry) => entry.key === key || entry.event.id === key,
        );
        if (found) {
          linked = undefined;
          open(found);
          return;
        }
        if (!isSettled) return;
        linked = undefined;
        write(undefined);
      },
      { immediate: true },
    );
  });
}
