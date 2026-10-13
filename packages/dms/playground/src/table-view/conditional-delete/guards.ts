import { HTTPResult } from "@antelopejs/interface-api";

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const JSON_TYPE = "application/json";
const MIN_NAME_LENGTH = 3;
const MAX_DELETED_AT_ONCE = 3;

/** A guard's refusal, naming the form field it belongs to when there is one. */
function refuse(status: number, message: string, field?: string): HTTPResult {
  return new HTTPResult(status, JSON.stringify({ message, field }), JSON_TYPE);
}

/** `edit` and `new`: a name too short is refused under the name field. */
export function assertNameLength(name: unknown): void {
  if (typeof name === "string" && name.trim().length < MIN_NAME_LENGTH) {
    throw refuse(
      HTTP_BAD_REQUEST,
      `A name takes at least ${MIN_NAME_LENGTH} characters`,
      "name",
    );
  }
}

/** `new`: a due date already past is refused under its field. */
export function assertDueDateAhead(dueDate: unknown): void {
  if (!dueDate) return;
  const due = new Date(dueDate as string | Date);
  if (due.getTime() < Date.now()) {
    throw refuse(HTTP_BAD_REQUEST, "The due date is already past", "due_date");
  }
}

/** `delete`: a few rows at a time, whatever the selection. */
export function assertFewRows(ids: string[]): void {
  if (ids.length > MAX_DELETED_AT_ONCE) {
    throw refuse(
      HTTP_FORBIDDEN,
      `Delete at most ${MAX_DELETED_AT_ONCE} tasks at once`,
    );
  }
}

/** `get`: a cancelled task's details are not served. */
export function assertNotCancelled(status: unknown): void {
  if (status === "cancelled") {
    throw refuse(HTTP_NOT_FOUND, "A cancelled task has no details");
  }
}

/** The `AfterWrite` an edit returns: runs once the write succeeded. */
export function logEdit(name: unknown) {
  return () => {
    console.info(`[playground] task "${String(name)}" edited`);
  };
}
