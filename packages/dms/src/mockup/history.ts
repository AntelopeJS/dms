import { mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Logging } from "@antelopejs/interface-core/logging";
import { z } from "zod";
import { compileSpec, parseSpec } from "./compile";
import { MISSING_FILE, parseFsError, writeAtomically } from "./files";
import type { JsonObject, MockupName } from "./model";
import { jsonObjectSchema } from "./model";

/** Who wrote a version: the AI's tools, the viewer, or a change picked up from the file. */
export const MOCKUP_AUTHORS = ["ai", "you", "disk"] as const;
export type MockupAuthor = (typeof MOCKUP_AUTHORS)[number];

/** How many versions of one mockup are kept; older ones are pruned. */
export const HISTORY_LIMIT = 50;

/** Writes by one author closer together than this share one version. */
export const COALESCE_WINDOW_MS = 2 * 60 * 1000;

/**
 * The id an AI write may carry so its version folds with the writes of the
 * same id alone, such as every write of one assistant reply: 1 to 128
 * letters, digits, `_` and `-`.
 */
export const mockupWriteGroupSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/)
  .brand<"MockupWriteGroup">();
export type MockupWriteGroup = z.infer<typeof mockupWriteGroupSchema>;

/** How long a caller-supplied summary may be. */
export const MAX_SUMMARY_LENGTH = 200;

/** How many page names a summary lists before it counts the rest. */
const NAMES_LISTED = 3;
const SUMMARY_SEPARATOR = " · ";

const versionSchema = z.object({
  seq: z.number().int().positive(),
  at: z.string(),
  by: z.enum(MOCKUP_AUTHORS),
  summary: z.string(),
  /** A sealed version never takes a later write in: a restore stays what it says. */
  sealed: z.boolean().optional(),
  /** The write group of the AI writes folded into it; a version without one folds by time. */
  group: mockupWriteGroupSchema.optional().catch(undefined),
  spec: jsonObjectSchema,
});

/** One recorded state of a mockup's spec. */
export type MockupVersion = z.infer<typeof versionSchema>;

/** A version as the list shows it, without its spec. */
export interface MockupVersionSummary {
  seq: number;
  at: string;
  by: MockupAuthor;
  summary: string;
}

/** What a write says about itself, so its version can be told apart. */
export interface RecordOptions {
  by: MockupAuthor;
  /** Replaces the automatic summary. */
  summary?: string;
  /** Whether the version stays alone: it joins no earlier one, and no later write joins it. */
  sealed?: boolean;
  /** When the write happened; now by default. */
  at?: Date;
  /** The write group of an AI write: it folds with the writes of this group alone. */
  group?: MockupWriteGroup;
}

const VERSION_FILE = /^(\d+)\.json$/;

/**
 * Where the versions of `name` live: `.antelope/mockup-history/<name>` next
 * to the `mockups/` directory, so they stay out of the project's git tree.
 */
export function historyDirectory(mockupsDir: string, name: MockupName): string {
  return join(dirname(mockupsDir), ".antelope", "mockup-history", name);
}

function versionPath(directory: string, seq: number): string {
  return join(directory, `${seq}.json`);
}

interface PageEntry {
  id: string;
  name: string;
  page: unknown;
}

function pagesOf(spec: JsonObject): PageEntry[] {
  const { pages } = spec;
  if (!Array.isArray(pages)) return [];
  return pages.flatMap((page) => {
    const parsed = z
      .object({ id: z.string(), title: z.string().optional() })
      .passthrough()
      .safeParse(page);
    if (!parsed.success) return [];
    return [
      {
        id: parsed.data.id,
        name: parsed.data.title?.trim() || parsed.data.id,
        page,
      },
    ];
  });
}

function listed(label: string, names: string[]): string | undefined {
  if (!names.length) return undefined;
  const shown = names.slice(0, NAMES_LISTED).join(", ");
  const rest = names.length - NAMES_LISTED;
  return `${label} ${shown}${rest > 0 ? ` and ${rest} more` : ""}`;
}

function withoutPages(spec: JsonObject): JsonObject {
  const { pages: _pages, ...rest } = spec;
  return rest;
}

/**
 * What changed from `previous` to `next`, at page level: "Added Orders,
 * Customers · Changed Overview · Removed Coupons". A page is the same page by
 * its id. The first version of a mockup says how many pages it was created with.
 */
export function summarizeChange(
  previous: JsonObject | undefined,
  next: JsonObject,
): string {
  const after = pagesOf(next);
  if (!previous) {
    return `Created with ${after.length} ${after.length === 1 ? "page" : "pages"}`;
  }
  const before = pagesOf(previous);
  const beforeById = new Map(before.map((entry) => [entry.id, entry]));
  const afterIds = new Set(after.map((entry) => entry.id));
  const added = after.filter((entry) => !beforeById.has(entry.id));
  const removed = before.filter((entry) => !afterIds.has(entry.id));
  const changed = after.filter((entry) => {
    const earlier = beforeById.get(entry.id);
    return earlier && !isDeepStrictEqual(earlier.page, entry.page);
  });
  const parts = [
    listed(
      "Added",
      added.map((entry) => entry.name),
    ),
    listed(
      "Changed",
      changed.map((entry) => entry.name),
    ),
    listed(
      "Removed",
      removed.map((entry) => entry.name),
    ),
  ].flatMap((part) => part ?? []);
  if (parts.length) return parts.join(SUMMARY_SEPARATOR);
  if (!isDeepStrictEqual(withoutPages(previous), withoutPages(next))) {
    return "Changed mockup settings";
  }
  const order = (entries: PageEntry[]) => entries.map((entry) => entry.id);
  return isDeepStrictEqual(order(before), order(after))
    ? "No page changes"
    : "Reordered pages";
}

async function versionSeqs(directory: string): Promise<number[]> {
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error) {
    if (parseFsError(error).code === MISSING_FILE) return [];
    throw error;
  }
  return files
    .flatMap((file) => {
      const match = VERSION_FILE.exec(file);
      return match ? [Number(match[1])] : [];
    })
    .sort((left, right) => left - right);
}

async function readAt(
  directory: string,
  seq: number | undefined,
): Promise<MockupVersion | undefined> {
  if (seq === undefined) return undefined;
  try {
    const text = await readFile(versionPath(directory, seq), "utf8");
    const parsed = versionSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch (error) {
    if (parseFsError(error).code === MISSING_FILE) return undefined;
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

/** The versions of `name`, oldest first; a file that does not read is skipped. */
export async function readVersions(
  mockupsDir: string,
  name: MockupName,
): Promise<MockupVersion[]> {
  const directory = historyDirectory(mockupsDir, name);
  const versions = await Promise.all(
    (await versionSeqs(directory)).map((seq) => readAt(directory, seq)),
  );
  return versions.flatMap((version) => version ?? []);
}

/** One version of `name`, or undefined when there is none with that number. */
export function readVersion(
  mockupsDir: string,
  name: MockupName,
  seq: number,
): Promise<MockupVersion | undefined> {
  return readAt(historyDirectory(mockupsDir, name), seq);
}

/** The number of the newest version of `name`, or undefined when it has none. */
export async function newestVersion(
  mockupsDir: string,
  name: MockupName,
): Promise<number | undefined> {
  return (await versionSeqs(historyDirectory(mockupsDir, name))).at(-1);
}

/** The versions of `name` as a list shows them, newest first. */
export async function listVersions(
  mockupsDir: string,
  name: MockupName,
): Promise<MockupVersionSummary[]> {
  const versions = await readVersions(mockupsDir, name);
  return versions
    .map(({ seq, at, by, summary }) => ({ seq, at, by, summary }))
    .reverse();
}

function joins(head: MockupVersion, options: RecordOptions, at: Date): boolean {
  if (head.sealed || options.sealed || head.by !== options.by) return false;
  if (head.group !== undefined || options.group !== undefined) {
    return head.group === options.group;
  }
  const elapsed = at.getTime() - Date.parse(head.at);
  return elapsed >= 0 && elapsed < COALESCE_WINDOW_MS;
}

/**
 * Records `spec` as the newest version of `name`, and prunes what passes
 * {@link HISTORY_LIMIT}. Writes by one author within
 * {@link COALESCE_WINDOW_MS} of the newest version replace it, so a page by
 * page build is one version. A write with a group replaces the newest version
 * when that version has the same group, however long ago, and never one with
 * another group or none. A spec equal to the newest version records nothing.
 * Callers hold the spec lock of `name`.
 */
export async function recordVersion(
  mockupsDir: string,
  name: MockupName,
  spec: JsonObject,
  options: RecordOptions,
): Promise<MockupVersion | undefined> {
  const directory = historyDirectory(mockupsDir, name);
  const seqs = await versionSeqs(directory);
  const head = await readAt(directory, seqs.at(-1));
  if (head && isDeepStrictEqual(head.spec, spec)) return undefined;
  const at = options.at ?? new Date();
  const joined = head && joins(head, options, at) ? head : undefined;
  const earlier = joined ? await readAt(directory, seqs.at(-2)) : head;
  const seq = joined ? joined.seq : (head?.seq ?? 0) + 1;
  const version: MockupVersion = {
    seq,
    at: at.toISOString(),
    by: options.by,
    summary: options.summary ?? summarizeChange(earlier?.spec, spec),
    ...(options.sealed && { sealed: true }),
    ...(options.group !== undefined && { group: options.group }),
    spec,
  };
  await mkdir(directory, { recursive: true });
  await writeAtomically(versionPath(directory, seq), JSON.stringify(version));
  const kept = new Set([...seqs, seq]);
  const doomed = [...kept].sort((a, b) => a - b).slice(0, -HISTORY_LIMIT);
  await Promise.all(
    doomed.map((old) => rm(versionPath(directory, old), { force: true })),
  );
  return version;
}

/**
 * Records the text of `spec.json` as a version by `disk` when it is a valid
 * spec that differs from the newest version: a change made outside the
 * viewer and the AI tools. A file that is not valid is left out, as a write
 * of it would be refused.
 */
export async function recordDiskText(
  mockupsDir: string,
  name: MockupName,
  text: string,
  at?: Date,
): Promise<MockupVersion | undefined> {
  const read = parseSpec(text);
  if (!read.ok || compileSpec(name, read.spec).issues.length) return undefined;
  const spec = jsonObjectSchema.parse(JSON.parse(text));
  return recordVersion(mockupsDir, name, spec, { by: "disk", at });
}

/**
 * Takes the change of a spec that kept its content (ids stamped, a build
 * recorded) into the newest version, when that version held the spec as it
 * was: the stamp is the same state, not a new one.
 */
export async function amendNewest(
  mockupsDir: string,
  name: MockupName,
  before: JsonObject,
  after: JsonObject,
): Promise<void> {
  const directory = historyDirectory(mockupsDir, name);
  const head = await readAt(directory, (await versionSeqs(directory)).at(-1));
  if (!head || !isDeepStrictEqual(head.spec, before)) return;
  await writeAtomically(
    versionPath(directory, head.seq),
    JSON.stringify({ ...head, spec: after }),
  );
}

/** Moves the versions of `from` to `to`, as a renamed mockup keeps its history. */
export async function renameHistory(
  mockupsDir: string,
  from: MockupName,
  to: MockupName,
): Promise<void> {
  const source = historyDirectory(mockupsDir, from);
  const target = historyDirectory(mockupsDir, to);
  await rm(target, { recursive: true, force: true });
  try {
    await mkdir(dirname(target), { recursive: true });
    await rename(source, target);
  } catch (error) {
    if (parseFsError(error).code !== MISSING_FILE) throw error;
  }
}

/** Deletes the versions of `name`, as a deleted mockup leaves none behind. */
export async function removeHistory(
  mockupsDir: string,
  name: MockupName,
): Promise<void> {
  await rm(historyDirectory(mockupsDir, name), {
    recursive: true,
    force: true,
  });
}

/**
 * Runs a history write that must never fail the spec write it follows: a
 * history that cannot be written logs a warning and the write stands.
 */
export async function keepingHistory<Result>(
  name: MockupName,
  record: () => Promise<Result>,
): Promise<void> {
  try {
    await record();
  } catch (error) {
    Logging.Warn(
      `[DMS] mockup "${name}": its history could not be kept`,
      error,
    );
  }
}
