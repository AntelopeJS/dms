// What the drag engine reads of the agenda, and the preview it builds from
// a drag over a target: the placement, whether the drop may land and why
// not, Alt's copy, the pending items' unschedule.

import type { Ref } from "vue";
import type {
  AgendaBackground,
  AgendaCalendar,
  AgendaResource,
} from "../../../types/full-agenda";
import type {
  AgendaContext,
  AgendaDayKey,
  AgendaDragPreview,
  AgendaDropTarget,
  AgendaFormat,
  AgendaOccurrence,
  AgendaRange,
  ResolvedAgendaOptions,
  ResolvedAgendaView,
} from "./agendaModel";
import { placeDrag } from "./agendaDragMath";
import { occurrencePlacement, samePlacement } from "./agendaDragBasics";
import type { AgendaDragConfig, AgendaDragSource } from "./agendaDragBasics";
import { checkDrop } from "./agendaDragRules";
import type { AgendaDropRules } from "./agendaDragRules";
import { parseSlots } from "./agendaSlots";
import type { AgendaNudgeContext } from "./agendaDragKeys";

/** What the drag engine needs of the agenda (`useAgenda` passes its context's parts). */
export interface AgendaDragDeps {
  options: Readonly<Ref<ResolvedAgendaOptions>>;
  /** The view drawn: its hidden days. */
  view: Readonly<Ref<ResolvedAgendaView>>;
  occurrences: Readonly<Ref<AgendaOccurrence[]>>;
  /**
   * The occurrences of the range before the legend, the search and the
   * facets hide any: what `allowOverlap: false` checks against (a hidden
   * calendar's event still takes its time). Defaults to `occurrences`.
   */
  rangeOccurrences?: Readonly<Ref<AgendaOccurrence[]>>;
  resources: Readonly<Ref<AgendaResource[]>>;
  /** The calendars: a pending item of a read-only calendar is not dropped. */
  calendars?: Readonly<Ref<AgendaCalendar[]>>;
  /** The range shown: where a pending item is planned from the keyboard. Defaults to two weeks from today. */
  range?: Readonly<Ref<AgendaRange>>;
  /** The day the range is built around: keyboard planning starts there. Defaults to today. */
  anchor?: Readonly<Ref<AgendaDayKey>>;
  backgrounds: Readonly<Ref<AgendaBackground[]>>;
  hoursOn: AgendaContext["hoursOn"];
  apply: AgendaContext["apply"];
  createAt: AgendaContext["createAt"];
  format: AgendaFormat;
  t: (key: string, params?: Record<string, unknown>) => string;
}

/** The configuration a placement reads, from the resolved options. */
export function dragConfig(
  options: ResolvedAgendaOptions,
  hiddenDays: number[],
): AgendaDragConfig {
  const constraints = options.raw.constraints ?? {};
  return {
    timeZone: options.timeZone,
    snapMinutes: options.snapMinutes,
    slots: parseSlots(options.slots),
    hiddenDays,
    defaultDurationMinutes: options.defaultDurationMinutes,
    dayDropMinutes: options.scrollMinutes,
    minDurationMinutes: Math.max(
      options.snapMinutes,
      constraints.minDurationMinutes ?? 0,
    ),
    maxDurationMinutes: constraints.maxDurationMinutes,
  };
}

/** The drag configuration of the view drawn. */
export const viewDragConfig = (deps: AgendaDragDeps): AgendaDragConfig =>
  dragConfig(
    deps.options.value,
    deps.view.value.hiddenDays ?? deps.options.value.hiddenDays,
  );

/** What a key's move reads: slots step only on a timeline by slot (time grids snap to minutes). */
export function viewNudgeContext(deps: AgendaDragDeps): AgendaNudgeContext {
  const config = viewDragConfig(deps);
  const view = deps.view.value;
  const isSlotTimeline = view.type === "timeline" && view.scale === "slot";
  return {
    snapMinutes: config.snapMinutes,
    hiddenDays: config.hiddenDays,
    timeZone: config.timeZone,
    slots: isSlotTimeline ? config.slots : [],
  };
}

/** What a drop is checked against. A range only picked (no create) ignores the constraints. */
export function dropRules(
  deps: AgendaDragDeps,
  kind: AgendaDragSource["kind"],
): AgendaDropRules {
  const options = deps.options.value;
  const isSelect = kind === "select";
  const resources = isSelect ? [] : deps.resources.value;
  return {
    timeZone: options.timeZone,
    constraints: isSelect ? {} : (options.raw.constraints ?? {}),
    resources: new Map(resources.map((resource) => [resource.id, resource])),
    businessHours: options.businessHours,
    hoursOn: deps.hoursOn,
    backgrounds: deps.backgrounds.value,
    occurrences: (deps.rangeOccurrences ?? deps.occurrences).value,
    calendars: deps.calendars?.value ?? [],
    minDate: options.raw.minDate,
    maxDate: options.raw.maxDate,
  };
}

/** An event over the pending items: it goes back to them (when they take drops). */
function pendingPreview(
  deps: AgendaDragDeps,
  source: AgendaDragSource,
): AgendaDragPreview | null {
  const { occurrence } = source;
  const acceptsDrop = deps.options.value.raw.unscheduled?.acceptDrop !== false;
  if (source.kind !== "move" || !occurrence || !acceptsDrop) return null;
  return {
    kind: source.kind,
    occurrenceKey: occurrence.key,
    ...occurrencePlacement(occurrence),
    valid: true,
    copy: false,
    toPending: true,
  };
}

/** The drag over a target, as the views draw it. */
export interface AgendaPreviewInput {
  source: AgendaDragSource;
  target: AgendaDropTarget;
  /** Alt is held. */
  alt: boolean;
  rules: AgendaDropRules;
}

/** The preview of a drag over a target: where it lands, and whether it may. */
export function buildPreview(
  deps: AgendaDragDeps,
  input: AgendaPreviewInput,
): AgendaDragPreview | null {
  const { source, target } = input;
  if (target.pending) return pendingPreview(deps, source);
  const { occurrence, item } = source;
  const placement = placeDrag(source, target, viewDragConfig(deps));
  const copy =
    source.kind === "move" &&
    input.alt &&
    deps.options.value.raw.copyOnAltDrag === true;
  const refusal = checkDrop(
    {
      placement,
      occurrence,
      copy,
      allowedResourceIds:
        occurrence?.event.allowedResourceIds ?? item?.allowedResourceIds,
      calendarId: item?.calendarId,
      checkDuration: source.kind !== "move",
    },
    input.rules,
  );
  return {
    kind: source.kind,
    occurrenceKey: occurrence?.key,
    itemId: item?.id,
    ...placement,
    valid: refusal === null,
    reason: refusal ? deps.t(`dms.agenda.drag.reason.${refusal}`) : undefined,
    copy,
    toPending: false,
  };
}

/** Both previews draw the same: the views need no update. */
export function samePreview(
  a: AgendaDragPreview | null,
  b: AgendaDragPreview | null,
): boolean {
  if (!a || !b) return a === b;
  return (
    samePlacement(a, b) &&
    a.valid === b.valid &&
    a.reason === b.reason &&
    a.copy === b.copy &&
    a.toPending === b.toPending &&
    a.kind === b.kind
  );
}
