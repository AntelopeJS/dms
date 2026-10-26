// The data of an agenda as pure functions: the query `fetchUrl` is read
// with, the block's lists merged with the answer's, and a save's answer laid
// over the data read.

import type {
  AgendaChange,
  AgendaData,
  AgendaEvent,
  AgendaPendingItem,
  AgendaSaveResponse,
  AgendaSavedEvent,
} from "../../../types/full-agenda";
import type { AgendaRange } from "./agendaModel";
import { applyChange, pendingOfEvent } from "./agendaChanges";
import type { AgendaFacetValues } from "./agendaFilters";

const LIST_SEPARATOR = ",";
const FACET_PARAM_PREFIX = "facet_";

/** The query `fetchUrl` is read with. */
export function agendaFetchQuery(input: {
  range: Pick<AgendaRange, "from" | "to">;
  viewId: string;
  timeZone: string;
  search: string;
  facetValues: AgendaFacetValues;
  calendars?: string[];
}): Record<string, string> {
  const query: Record<string, string> = {
    from: input.range.from,
    to: input.range.to,
    view: input.viewId,
    tz: input.timeZone,
  };
  const search = input.search.trim();
  if (search) query.q = search;
  if (input.calendars) query.calendars = input.calendars.join(LIST_SEPARATOR);
  for (const [id, values] of Object.entries(input.facetValues)) {
    if (values.length)
      query[`${FACET_PARAM_PREFIX}${id}`] = values.join(LIST_SEPARATOR);
  }
  return query;
}

/** Lists merged by id: the block's first, in order, each replaced by the answer's of the same id. */
export function mergeById<T extends { id: string }>(
  own: T[] | undefined,
  answered: T[] | undefined,
): T[] {
  if (!answered?.length) return own ?? [];
  const byId = new Map(answered.map((entry) => [entry.id, entry]));
  const merged = (own ?? []).map((entry) => byId.get(entry.id) ?? entry);
  const ownIds = new Set((own ?? []).map((entry) => entry.id));
  return [...merged, ...answered.filter((entry) => !ownIds.has(entry.id))];
}

/** A saved event without the `tempId` it was answered with. */
function withoutTempId(event: AgendaSavedEvent): AgendaEvent {
  const { tempId: _tempId, ...rest } = event;
  return rest;
}

const changedId = (change: AgendaChange) => change.tempId ?? change.id;

/** The event a written `create` or `schedule` draws as (a pending item's title, colour...). */
export type AgendaSeedOf = (change: AgendaChange) => AgendaEvent | undefined;

/** The pending items after written changes: a scheduled one gone, an unscheduled event back. */
function pendingAfter(
  data: AgendaData,
  written: AgendaChange[],
): AgendaPendingItem[] | undefined {
  let items = data.unscheduled;
  for (const change of written) {
    if (change.kind === "schedule")
      items = items?.filter((item) => item.id !== change.id);
    if (change.kind !== "unschedule") continue;
    const event = data.events.find((entry) => entry.id === change.id);
    if (event && !items?.some((item) => item.id === event.id))
      items = [...(items ?? []), pendingOfEvent(event)];
  }
  return items;
}

/**
 * The data after a save's answer: the answered events in place of the ones
 * of their id or their change's `tempId`, the removed ones gone, each
 * written change the answer does not show applied as sent, and the
 * answered lists in place of the read's (else the pending items a schedule
 * took or an unschedule gave back).
 */
export function applySaveAnswer(
  data: AgendaData,
  response: AgendaSaveResponse,
  written: AgendaChange[],
  seedOf: AgendaSeedOf = () => undefined,
  /** The agenda's zone: a series without one of its own moves in it. */
  timeZone = "UTC",
): AgendaData {
  const answered = response.events ?? [];
  const replaced = new Set(
    answered.flatMap((event) => [event.id, event.tempId ?? event.id]),
  );
  const removed = new Set(response.removed ?? []);
  let events = data.events.filter(
    (event) => !replaced.has(event.id) && !removed.has(event.id),
  );
  for (const change of written) {
    const id = changedId(change);
    if (id && (replaced.has(id) || removed.has(id))) continue;
    events = applyChange(events, change, seedOf(change), timeZone);
  }
  const unscheduled = response.unscheduled ?? pendingAfter(data, written);
  return {
    ...data,
    events: [...events, ...answered.map(withoutTempId)],
    ...(unscheduled && { unscheduled }),
    ...(response.notices && { notices: response.notices }),
    ...(response.backgrounds && { backgrounds: response.backgrounds }),
  };
}

/** Whether a written change leaves an id the route never named on screen (a new event, a detached occurrence). */
export function leavesLocalId(
  response: AgendaSaveResponse,
  written: AgendaChange[],
): boolean {
  const answered = new Set(
    (response.events ?? []).map((event) => event.tempId ?? event.id),
  );
  return written.some((change) => {
    if (change.kind === "create" || change.kind === "schedule")
      return !answered.has(change.tempId ?? "");
    return change.scope === "occurrence" && change.kind !== "delete";
  });
}

/** The range and view a request was made for. */
export interface AgendaAnsweredRange {
  from: string;
  to: string;
  view: string;
}

/** Whether two ranges are the same (no range given: taken as the same). */
export const isSameRange = (
  a: AgendaAnsweredRange | undefined,
  b: AgendaAnsweredRange | undefined,
) => !a || !b || (a.from === b.from && a.to === b.to && a.view === b.view);

/**
 * An answer without the lists that belong to its own range (`notices`,
 * `backgrounds`): laid over another range's read, they would describe the
 * wrong days.
 */
export function withoutRangeLists(
  response: AgendaSaveResponse,
): AgendaSaveResponse {
  const { notices: _notices, backgrounds: _backgrounds, ...rest } = response;
  return rest;
}

/** A save's answer, kept to lay over a read made before it. */
export interface AgendaAnswerLayer {
  /** Its place among the writes (1 for the first). */
  seq: number;
  response: AgendaSaveResponse;
  written: AgendaChange[];
  /** The events new ones drew as, by their temporary id. */
  seeds: Map<string, AgendaEvent>;
  /** The range it was answered for: its notices and backgrounds are that range's. */
  range?: AgendaAnsweredRange;
}

/** How many answers are kept to lay over older reads. */
export const KEPT_ANSWER_LAYERS = 30;

/**
 * A read with the save answers made after it laid over it (a week read
 * before a move and shown again from cache shows the move).
 */
export function layerAnswers(
  data: AgendaData,
  layers: AgendaAnswerLayer[],
  readAt: number,
  timeZone: string,
  /** The range the read is of. */
  range?: AgendaAnsweredRange,
): AgendaData {
  return layers
    .filter((layer) => layer.seq > readAt)
    .reduce(
      (current, layer) =>
        applySaveAnswer(
          current,
          isSameRange(layer.range, range)
            ? layer.response
            : withoutRangeLists(layer.response),
          layer.written,
          (change) => layer.seeds.get(change.tempId ?? ""),
          timeZone,
        ),
      data,
    );
}
