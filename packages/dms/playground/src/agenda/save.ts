import type {
  AgendaChange,
  AgendaChangeKind,
  AgendaEvent,
  AgendaEventPatch,
  AgendaSaveError,
  AgendaSaveRequest,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import { HTTPResult } from "@antelopejs/interface-api";
import { badRequest } from "../matrix/save";
import { isDayKey } from "./time";

const HTTP_NOT_FOUND = 404;
const JSON_TYPE = "application/json";

const CHANGE_KINDS = new Set<AgendaChangeKind>([
  "create",
  "update",
  "move",
  "resize",
  "delete",
  "schedule",
  "unschedule",
]);

// The kinds naming the event (or the pending item) they apply to.
const KINDS_WITH_ID = new Set<AgendaChangeKind>([
  "update",
  "move",
  "resize",
  "delete",
  "schedule",
  "unschedule",
]);

/** A save request checked for its shape. */
export interface AgendaSaveInput {
  changes: AgendaChange[];
  /** The user confirmed a question, or chose Overwrite on a conflict. */
  force: boolean;
  /** Whether `previous` is checked: the block's `conflicts: "detect"`, unless forced. */
  detectsConflicts: boolean;
  /** The days and view shown, for the notices answered. */
  from: string;
  to: string;
  view: string;
}

function isChange(change: AgendaChange | null | undefined): boolean {
  if (!change || !CHANGE_KINDS.has(change.kind)) return false;
  if (KINDS_WITH_ID.has(change.kind)) return typeof change.id === "string";
  return true;
}

/**
 * The changes a `saveUrl` received, checked for their shape: a body that is
 * not an {@link AgendaSaveRequest} fails the whole request with a 400. A
 * route checks `previous` only when the block detects conflicts and the user
 * did not choose Overwrite.
 */
export function readAgendaSave(
  body: AgendaSaveRequest | undefined,
): AgendaSaveInput {
  const changes = body?.changes;
  if (!Array.isArray(changes) || !changes.every(isChange)) {
    throw badRequest(
      "Expected { changes: [{ kind, id?, tempId?, patch?, previous? }], conflicts, from, to, view }.",
    );
  }
  const force = body?.force === true;
  return {
    changes,
    force,
    detectsConflicts: body?.conflicts === "detect" && !force,
    from: body?.from ?? "",
    to: body?.to ?? "",
    view: body?.view ?? "",
  };
}

function sameInstant(left: string, right: string): boolean {
  if (isDayKey(left) || isDayKey(right)) return left === right;
  return Date.parse(left) === Date.parse(right);
}

function sameList(left: string[] = [], right: string[] = []): boolean {
  return [...left].sort().join() === [...right].sort().join();
}

type FieldCheck = (previous: AgendaEventPatch, current: AgendaEvent) => boolean;

// Each field `previous` may hold, and how it compares with what is stored.
const PREVIOUS_CHECKS: Record<keyof AgendaEventPatch, FieldCheck> = {
  title: (previous, current) => previous.title === current.title,
  start: (previous, current) =>
    !previous.start || sameInstant(previous.start, current.start),
  end: (previous, current) =>
    !previous.end || !current.end || sameInstant(previous.end, current.end),
  allDay: (previous, current) => !!previous.allDay === !!current.allDay,
  calendarId: (previous, current) => previous.calendarId === current.calendarId,
  resourceIds: (previous, current) =>
    sameList(previous.resourceIds, current.resourceIds),
  location: (previous, current) =>
    (previous.location ?? "") === (current.location ?? ""),
  description: (previous, current) =>
    (previous.description ?? "") === (current.description ?? ""),
  // The details form's own fields are checked by the fields the route owns.
  data: () => true,
};

/**
 * Whether the stored event still holds what the change read before it was
 * made: only the fields `previous` names are compared.
 */
export function stillAsRead(
  previous: AgendaEventPatch | undefined,
  current: AgendaEvent,
): boolean {
  if (!previous) return true;
  return (Object.keys(previous) as (keyof AgendaEventPatch)[]).every(
    (field) => PREVIOUS_CHECKS[field]?.(previous, current) ?? true,
  );
}

/** A change refused, with the reason the block shows. */
export function refused(index: number, message: string): AgendaSaveError {
  return { index, message, code: "refused" };
}

/** A change made on an event gone since it was read. */
export function notFound(index: number, message: string): AgendaSaveError {
  return { index, message, code: "notFound" };
}

/** A change made on an event that moved since it was read. */
export function conflict(
  index: number,
  message: string,
  current: AgendaEvent,
): AgendaSaveError {
  return { index, message, code: "conflict", current };
}

/** A 404 naming what an action asked for and the route no longer holds. */
export function missing(message: string): HTTPResult {
  return new HTTPResult(HTTP_NOT_FOUND, JSON.stringify({ message }), JSON_TYPE);
}

/** The `id` an event action names in its URL (`?id={{row.id}}`). */
export function actionId(params: URLSearchParams): string {
  const id = params.get("id");
  if (!id) throw badRequest("Expected ?id=<event id>.");
  return id;
}
