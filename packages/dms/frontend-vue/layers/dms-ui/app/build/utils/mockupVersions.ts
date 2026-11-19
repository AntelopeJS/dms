import {
  isNumber,
  isObject,
  isString,
} from "../../../../dms-core/app/utils/type-check";
import {
  mockupEndpoint,
  parseAnnotations,
  parseMockupState,
  type MockupAnnotation,
  type MockupState,
} from "./mockup";

/** Who wrote a version of a mockup: the AI's tools, this viewer, or an edit of the file. */
export type MockupVersionAuthor = "ai" | "you" | "disk";

/** A version as the history lists it. */
export interface MockupVersionSummary {
  seq: number;
  /** When it was last written, ISO 8601. */
  at: string;
  by: MockupVersionAuthor;
  summary: string;
}

/** A version as the history lists it, with how many comments were pinned on it, resolved ones included. */
export interface MockupVersionListEntry extends MockupVersionSummary {
  comments: number;
}

/**
 * A version with how it draws, and the comments pinned on it, each located in
 * that version's spec: what the canvas shows while it is previewed.
 */
export interface MockupVersion extends MockupVersionSummary {
  state: MockupState;
  annotations: MockupAnnotation[];
}

/** The path of a mockup's history, `suffix` included (`/3`, `/3/restore`). */
export function mockupHistoryEndpoint(name: string, suffix = ""): string {
  return mockupEndpoint(name, `/history${suffix}`);
}

function isRecord(
  value: Parameters<typeof isObject>[0],
): value is Record<string, unknown> {
  return isObject(value) && value !== null && !Array.isArray(value);
}

function isAuthor(value: unknown): value is MockupVersionAuthor {
  return value === "ai" || value === "you" || value === "disk";
}

function isSummary(
  value: Parameters<typeof isObject>[0],
): value is MockupVersionSummary {
  return (
    isRecord(value) &&
    isNumber(value.seq) &&
    isString(value.at) &&
    isAuthor(value.by) &&
    isString(value.summary)
  );
}

function isListEntry(
  value: Parameters<typeof isObject>[0],
): value is MockupVersionListEntry {
  return isRecord(value) && isSummary(value) && isNumber(value.comments);
}

/** The versions of a `{ versions }` answer, newest first, or undefined when it is not one. */
export function parseVersionList(
  value: Parameters<typeof isObject>[0],
): MockupVersionListEntry[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.versions)) return undefined;
  return value.versions.every(isListEntry) ? value.versions : undefined;
}

/** The version a `GET .../history/:seq` answers, or undefined when the answer is not one. */
export function parseVersion(
  value: Parameters<typeof isObject>[0],
): MockupVersion | undefined {
  if (!isRecord(value) || !isSummary(value)) return undefined;
  const state = parseMockupState(value.state);
  const annotations = parseAnnotations(value);
  if (!state || !annotations) return undefined;
  const { seq, at, by, summary } = value;
  return { seq, at, by, summary, state, annotations };
}

/** What a restore answers: it landed, or the issue that refused it. */
export type MockupRestoreAnswer = { ok: true } | { ok: false; message: string };

/** The answer of `POST .../restore`, or undefined when it is not one. */
export function parseRestore(
  value: Parameters<typeof isObject>[0],
): MockupRestoreAnswer | undefined {
  if (!isRecord(value)) return undefined;
  if (value.ok === true) return { ok: true };
  const errors: unknown[] = Array.isArray(value.errors) ? value.errors : [];
  const first = errors[0];
  if (value.ok !== false || !isRecord(first)) return undefined;
  const { path, message } = first;
  return isString(path) && isString(message)
    ? { ok: false, message: path ? `${path}: ${message}` : message }
    : undefined;
}

/** The key that names the newest version as written: it changes when a write folds into it. */
export function headKey(
  versions: readonly MockupVersionSummary[],
): string | undefined {
  const [head] = versions;
  return head && `${head.seq}@${head.at}`;
}
