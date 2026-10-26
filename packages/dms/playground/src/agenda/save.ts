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
  /** The user confirmed the route's question: it is not asked again. */
  force: boolean;
  /**
   * Whether `previous` is checked: the block's `conflicts: "detect"`, unless
   * the user chose Overwrite (`overwrite`). Confirming a question (`force`)
   * does not skip it.
   */
  detectsConflicts: boolean;
  /** The days and view shown, for the notices answered. */
  from: string;
  to: string;
  view: string;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SCOPES = new Set(["occurrence", "series"]);

/** Whether a text is a day that exists (`2026-02-28`, not `2026-02-30`). */
function isCalendarDay(text: string): boolean {
  if (!DAY_PATTERN.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

/** An occurrence is a day that exists (`YYYY-MM-DD`), a scope one of the two. */
function hasValidOccurrence(change: AgendaChange): boolean {
  const { occurrence, scope } = change;
  if (occurrence !== undefined) {
    if (typeof occurrence !== "string" || !isCalendarDay(occurrence)) {
      return false;
    }
  }
  return scope === undefined || SCOPES.has(scope);
}

function isChange(change: AgendaChange | null | undefined): boolean {
  if (!change || !CHANGE_KINDS.has(change.kind)) return false;
  if (!hasValidOccurrence(change)) return false;
  if (KINDS_WITH_ID.has(change.kind)) return typeof change.id === "string";
  return true;
}

/**
 * The changes a `saveUrl` received, checked for their shape: a body that is
 * not an {@link AgendaSaveRequest} fails the whole request with a 400. A
 * route checks `previous` only when the block detects conflicts and the user
 * did not choose Overwrite (`overwrite`); it asks its questions unless the
 * user confirmed them (`force`). Both may come together.
 */
export function readAgendaSave(
  body: AgendaSaveRequest | undefined,
): AgendaSaveInput {
  const changes = body?.changes;
  if (!Array.isArray(changes) || !changes.every(isChange)) {
    throw badRequest(
      "Expected { changes: [{ kind, id?, tempId?, patch?, previous?, occurrence?: YYYY-MM-DD, scope?: occurrence | series }], conflicts, from, to, view }.",
    );
  }
  return {
    changes,
    force: body?.force === true,
    detectsConflicts: body?.conflicts === "detect" && body.overwrite !== true,
    from: body?.from ?? "",
    to: body?.to ?? "",
    view: body?.view ?? "",
  };
}

function sameInstant(left: string, right: string): boolean {
  if (isDayKey(left) || isDayKey(right)) return left === right;
  return Date.parse(left) === Date.parse(right);
}

// `previous` may hold anything a client sends: a list that is not one
// compares as none (never a 500).
function listOf(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function sameList(left: unknown, right: unknown): boolean {
  return listOf(left).sort().join() === listOf(right).sort().join();
}

type FieldCheck = (previous: AgendaEventPatch, current: AgendaEvent) => boolean;

/** A text field as compared: `null`, absent and empty all mean none. */
function text(value: string | null | undefined): string {
  return value ?? "";
}

// Each field `previous` may hold, and how it compares with what is stored.
// `previous` names a field `null` when the event did not have it.
const PREVIOUS_CHECKS: Record<keyof AgendaEventPatch, FieldCheck> = {
  title: (previous, current) => previous.title === current.title,
  start: (previous, current) =>
    !previous.start || sameInstant(previous.start, current.start),
  end: (previous, current) => {
    if (previous.end === null) return !current.end;
    return (
      !previous.end || !current.end || sameInstant(previous.end, current.end)
    );
  },
  allDay: (previous, current) => !!previous.allDay === !!current.allDay,
  calendarId: (previous, current) =>
    text(previous.calendarId) === text(current.calendarId),
  resourceIds: (previous, current) =>
    sameList(previous.resourceIds, current.resourceIds),
  location: (previous, current) =>
    text(previous.location) === text(current.location),
  description: (previous, current) =>
    text(previous.description) === text(current.description),
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
