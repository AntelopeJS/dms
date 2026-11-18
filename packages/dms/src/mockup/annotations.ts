import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  anchorSite,
  blockAnchorSchema,
  type BlockTree,
  locateAnchor,
  locateBlock,
  type NoteAnchor,
  noteAnchorSchema,
  type NoteSite,
  viewOf,
} from "./anchor";
import { parseSpec } from "./compile";
import {
  ANNOTATIONS_FILE,
  defaultMockupsDir,
  MISSING_FILE,
  parseFsError,
  mockupDirectory,
  writeAtomically,
} from "./files";
import { newestVersion } from "./history";
import type {
  Json,
  JsonObject,
  MockupIssue,
  MockupName,
  MockupSpec,
} from "./model";
import {
  annotationIdSchema,
  jsonPointer,
  pageIdSchema,
  specValueAt,
} from "./model";
import { SKETCH_STATE_PATTERN } from "./sketch";
import {
  readSpecSource,
  readSpecText,
  type SpecStamper,
  withSpecLock,
} from "./source";

const MAX_TEXT = 2000;
const MAX_POINTER = 2048;
const ID_BYTES = 12;
const JSON_INDENT = 2;
const FILE_VERSION = 3;

const textSchema = z.string().trim().min(1).max(MAX_TEXT);
const statusSchema = z.enum(["open", "resolved"]);
const versionNumberSchema = z.number().int().positive();
const fractionSchema = z.number().min(0).max(1);

/** A spec JSON pointer: `""` or `/`-led segments. */
const pointerSchema = z
  .string()
  .max(MAX_POINTER)
  .regex(/^(?:\/[^/]*)*$/);

/**
 * Where a pin sits on what it is on: fractions of its box, from its top left
 * corner, so the pin stays at the same spot of a block on every frame width.
 */
export const pinOffsetSchema = z
  .object({ x: fractionSchema, y: fractionSchema })
  .strict();
export type PinOffset = z.infer<typeof pinOffsetSchema>;

/** The named state of a sketch a note was pinned on, as the viewer drew it. */
const sketchStateSchema = z.string().regex(SKETCH_STATE_PATTERN);

/**
 * Where a reviewer puts a pin: on the node at the spec pointer `path` of the
 * page `page`, or on the page itself when there is no `path`, at `offset`.
 * `state` names the state of the sketch drawn there, absent for its default
 * `html` and for any other block.
 */
export const annotationPlaceSchema = z
  .object({
    page: pageIdSchema,
    path: pointerSchema.optional(),
    offset: pinOffsetSchema,
    state: sketchStateSchema.optional(),
  })
  .strict();
export type AnnotationPlace = z.infer<typeof annotationPlaceSchema>;

/** What a reviewer posts to pin a note: a place in the current spec, and the note. */
export const annotationDraftSchema = annotationPlaceSchema
  .extend({ text: textSchema })
  .strict();
export type AnnotationDraft = z.infer<typeof annotationDraftSchema>;

/** What an update may change of an annotation: its status, its text, and where it is pinned. */
export const annotationPatchSchema = z
  .object({
    status: statusSchema.optional(),
    text: textSchema.optional(),
    place: annotationPlaceSchema.optional(),
  })
  .strict();
export type AnnotationPatch = z.infer<typeof annotationPatchSchema>;

const storedSchema = z.object({
  id: annotationIdSchema,
  anchor: noteAnchorSchema,
  offset: pinOffsetSchema,
  text: z.string(),
  status: statusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().optional(),
  /** The history version that was newest when the note was pinned; absent on a note written before versions. */
  version: versionNumberSchema.optional(),
  /** The history version that was newest when the note was resolved. */
  resolvedVersion: versionNumberSchema.optional(),
  /** The state of the sketch the note was pinned on; absent on its default `html` and on any other block. */
  state: z.string().optional(),
});
type StoredAnnotation = z.infer<typeof storedSchema>;

/** Where a note of a version 2 file sits on its block: that version had no offset. */
const VERSION_2_OFFSET: PinOffset = { x: 0, y: 0 };

/** An annotations file as stored, a version 2 file read as version 3. The version 3 file takes `version` and `resolvedVersion` as optional fields. */
const annotationsFileSchema = z.union([
  z.object({
    version: z.literal(FILE_VERSION),
    annotations: z.array(storedSchema),
  }),
  z
    .object({
      version: z.literal(2),
      annotations: z.array(
        storedSchema
          .omit({ offset: true })
          .extend({ anchor: blockAnchorSchema }),
      ),
    })
    .transform(({ annotations }): AnnotationsFile => ({
      version: FILE_VERSION,
      annotations: annotations.map((note) => ({
        ...note,
        offset: VERSION_2_OFFSET,
      })),
    })),
]);

/**
 * A reviewer's pin on a mockup: a note on one block, or on one page as a
 * whole, at `offset` of its box. The file stores `anchor` and no location.
 * `page` and `path` are where the note is in the spec now, set when a note is
 * served: `page` alone for a note on a page, neither when its block or page
 * was removed. `version` is the history version the note was pinned on; a
 * note written before versions is served as pinned on the newest one.
 * `resolvedVersion` is the version it was resolved on.
 */
export type MockupAnnotation = StoredAnnotation & Partial<NoteSite>;

/** An annotations file, its notes as stored. */
interface AnnotationsFile {
  version: typeof FILE_VERSION;
  annotations: StoredAnnotation[];
}

/** Why a note could not be pinned where it was asked: nothing is there, its block cannot be told apart from another, or the spec does not parse. */
export type PlacementRefusal =
  | { kind: "no_node" }
  | { kind: "ambiguous" }
  | { kind: "spec_invalid"; errors: MockupIssue[] };

/** What creating an annotation answers. */
export type AnnotationCreation =
  | { kind: "created"; annotation: MockupAnnotation }
  | { kind: "no_mockup" }
  | PlacementRefusal;

/** What updating an annotation answers. */
export type AnnotationUpdate =
  | { kind: "updated"; annotation: MockupAnnotation }
  | { kind: "no_mockup" }
  | { kind: "no_annotation" }
  | PlacementRefusal;

/** The anchor a place gets, or why it gets none. */
type Anchoring = { kind: "anchored"; anchor: NoteAnchor } | PlacementRefusal;

/** The spec of a held mockup, read as it must be to take a stamped id, and the text it was read from. */
type StrictSpec =
  | { kind: "read"; spec: MockupSpec; text: string }
  | { kind: "missing" }
  | { kind: "invalid"; errors: MockupIssue[] };

/**
 * The last write of each annotations file, settled either way: the next
 * write of that file starts once it is done.
 */
const queues = new Map<string, Promise<void>>();

function serialized<T>(path: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(path) ?? Promise.resolve();
  const run = previous.then(task);
  queues.set(
    path,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

async function exists(directory: string): Promise<boolean> {
  try {
    return (await stat(directory)).isDirectory();
  } catch (error) {
    if (parseFsError(error).code === MISSING_FILE) return false;
    throw error;
  }
}

async function readAnnotationsFile(path: string): Promise<AnnotationsFile> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (parseFsError(error).code === MISSING_FILE) {
      return { version: FILE_VERSION, annotations: [] };
    }
    throw error;
  }
  const parsed = annotationsFileSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error(
      `${path} is not an annotations file: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

function writeAnnotationsFile(
  path: string,
  file: AnnotationsFile,
): Promise<void> {
  return writeAtomically(path, `${JSON.stringify(file, null, JSON_INDENT)}\n`);
}

function annotationsPath(mockupsDir: string, name: MockupName): string {
  return join(mockupDirectory(mockupsDir, name), ANNOTATIONS_FILE);
}

/** What a writer of a mockup's annotations holds while it runs: the mockup, its annotations path and the stamp writer of its spec lock. */
interface Held {
  mockupsDir: string;
  name: MockupName;
  stamp: SpecStamper;
  path: string;
}

/**
 * Runs `run` holding the spec lock of the mockup, then the queue of its
 * annotations file. Every writer of annotations takes them in this order, and
 * a note's anchoring may write the spec.
 */
function locked<Result>(
  mockupsDir: string,
  name: MockupName,
  run: (held: Held) => Promise<Result>,
): Promise<Result> {
  const path = annotationsPath(mockupsDir, name);
  return withSpecLock(mockupsDir, name, (_write, stamp) =>
    serialized(path, () => run({ mockupsDir, name, stamp, path })),
  );
}

async function readStrictSpec(held: Held): Promise<StrictSpec> {
  const text = await readSpecText(held.mockupsDir, held.name);
  if (text === undefined) return { kind: "missing" };
  const read = parseSpec(text);
  return read.ok
    ? { kind: "read", spec: read.spec, text }
    : { kind: "invalid", errors: read.issues };
}

/** The version `note` is pinned on, `newest` for a note written before versions. */
function pinnedOn(
  note: StoredAnnotation,
  newest: number | undefined,
): number | undefined {
  return note.version ?? newest;
}

/** `note` with its version, and where it is in `tree` now; as stored when its block or page is gone. */
function located(
  note: StoredAnnotation,
  tree: BlockTree | undefined,
  newest: number | undefined,
): MockupAnnotation {
  const version = pinnedOn(note, newest);
  const pinned = version === undefined ? note : { ...note, version };
  const site = tree ? locateAnchor(tree, note.anchor) : undefined;
  return site ? { ...pinned, ...site } : pinned;
}

/** The spec of a mockup as it is written now, however wrong, or undefined when it holds no object. */
async function currentTree(
  mockupsDir: string,
  name: MockupName,
): Promise<BlockTree | undefined> {
  return viewOf((await readSpecSource(mockupsDir, name))?.spec);
}

/**
 * A note as the AI reads it: `pointer` is the spec JSON pointer of its block
 * now, or of its page for a note on a page, and `node` is that block as the
 * spec holds it. A note on a page has no `node`, and a note whose block or
 * page was removed has neither.
 */
export type AnnotationInSpec = MockupAnnotation & {
  pointer?: string;
  node?: Json;
};

/** `note` with the pointer and the node of what it is on in `spec`. */
function inSpec(
  note: MockupAnnotation,
  spec: JsonObject | undefined,
  tree: BlockTree | undefined,
): AnnotationInSpec {
  if (note.path !== undefined && spec) {
    const node = specValueAt(spec, note.path);
    return node === undefined ? note : { ...note, pointer: note.path, node };
  }
  const page = tree?.pages.findIndex((entry) => entry?.id === note.page);
  return note.page !== undefined && page !== undefined && page >= 0
    ? { ...note, pointer: jsonPointer(["pages", page]) }
    : note;
}

/** The notes of a mockup placed in its spec now, and that spec, or undefined when the mockup does not exist. */
async function readPlaced(
  name: MockupName,
  mockupsDir: string,
): Promise<
  | {
      notes: MockupAnnotation[];
      spec: JsonObject | undefined;
      tree: BlockTree | undefined;
    }
  | undefined
> {
  if (!(await exists(mockupDirectory(mockupsDir, name)))) return undefined;
  const file = await readAnnotationsFile(annotationsPath(mockupsDir, name));
  const spec = (await readSpecSource(mockupsDir, name))?.spec;
  const tree = viewOf(spec);
  const newest = await newestVersion(mockupsDir, name);
  return {
    notes: file.annotations.map((note) => located(note, tree, newest)),
    spec,
    tree,
  };
}

/**
 * The annotations of a mockup, oldest first, each placed where its block or
 * page is in the spec now, or undefined when the mockup does not exist. A
 * note on a page has a `page` and no `path`; a note whose block or page was
 * removed has neither.
 */
export async function listAnnotations(
  name: MockupName,
  mockupsDir = defaultMockupsDir(),
): Promise<MockupAnnotation[] | undefined> {
  return (await readPlaced(name, mockupsDir))?.notes;
}

/**
 * The annotations of a mockup as {@link listAnnotations} lists them, each
 * with the pointer and the node of what it is on, read from the same spec.
 */
export async function listAnnotationsInSpec(
  name: MockupName,
  mockupsDir = defaultMockupsDir(),
): Promise<AnnotationInSpec[] | undefined> {
  const placed = await readPlaced(name, mockupsDir);
  return placed?.notes.map((note) => inSpec(note, placed.spec, placed.tree));
}

/**
 * The notes pinned on the version `seq` of a mockup, resolved ones included,
 * each placed where its block or page is in `spec`, the spec of that version.
 * Undefined when the mockup does not exist.
 */
export async function listVersionAnnotations(
  name: MockupName,
  seq: number,
  spec: JsonObject,
  mockupsDir = defaultMockupsDir(),
): Promise<MockupAnnotation[] | undefined> {
  if (!(await exists(mockupDirectory(mockupsDir, name)))) return undefined;
  const file = await readAnnotationsFile(annotationsPath(mockupsDir, name));
  const newest = await newestVersion(mockupsDir, name);
  const tree = viewOf(spec);
  return file.annotations
    .filter((note) => pinnedOn(note, newest) === seq)
    .map((note) => located(note, tree, newest));
}

/**
 * How many notes are pinned on each version of a mockup, resolved ones
 * included. A version with none has no entry.
 */
export async function countAnnotationsByVersion(
  name: MockupName,
  mockupsDir = defaultMockupsDir(),
): Promise<ReadonlyMap<number, number>> {
  const file = await readAnnotationsFile(annotationsPath(mockupsDir, name));
  const newest = await newestVersion(mockupsDir, name);
  const counts = new Map<number, number>();
  for (const note of file.annotations) {
    const version = pinnedOn(note, newest);
    if (version !== undefined) {
      counts.set(version, (counts.get(version) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The anchor of `place` in the spec `held` holds. A place on a page needs the
 * page alone. A place on a node anchors on its block, stamping an id on the
 * spec when the block needs one.
 */
async function anchorPlace(
  held: Held,
  place: AnnotationPlace,
): Promise<Anchoring> {
  const { page, path } = place;
  if (path === undefined) {
    const tree = await currentTree(held.mockupsDir, held.name);
    const anchor = { page };
    return tree && locateAnchor(tree, anchor)
      ? { kind: "anchored", anchor }
      : { kind: "no_node" };
  }
  const read = await readStrictSpec(held);
  if (read.kind === "missing") return { kind: "no_node" };
  if (read.kind === "invalid") {
    return { kind: "spec_invalid", errors: read.errors };
  }
  const anchored = anchorSite(read.spec, { page, path });
  if (!anchored) return { kind: "no_node" };
  if (locateBlock(read.spec, anchored.anchor)?.path !== path) {
    return { kind: "ambiguous" };
  }
  if (anchored.stamp) await held.stamp(read.text, [anchored.stamp]);
  return { kind: "anchored", anchor: anchored.anchor };
}

async function servedNow(
  held: Held,
  note: StoredAnnotation,
): Promise<MockupAnnotation> {
  return located(
    note,
    await currentTree(held.mockupsDir, held.name),
    await newestVersion(held.mockupsDir, held.name),
  );
}

async function create(
  held: Held,
  draft: AnnotationDraft,
): Promise<AnnotationCreation> {
  const file = await readAnnotationsFile(held.path);
  const anchored = await anchorPlace(held, draft);
  if (anchored.kind !== "anchored") return anchored;
  const version = await newestVersion(held.mockupsDir, held.name);
  const note: StoredAnnotation = {
    id: randomBytes(ID_BYTES).toString("base64url"),
    anchor: anchored.anchor,
    offset: draft.offset,
    text: draft.text,
    status: "open",
    createdAt: new Date().toISOString(),
    ...(version !== undefined && { version }),
    ...(draft.state !== undefined && { state: draft.state }),
  };
  await writeAnnotationsFile(held.path, {
    version: FILE_VERSION,
    annotations: [...file.annotations, note],
  });
  return { kind: "created", annotation: await servedNow(held, note) };
}

/**
 * Adds an open annotation, pinned on the newest version of the mockup, at the draft's place in the current spec: on the
 * page `page` when the draft has no `path`, else on the block of the node at
 * `path`. When that node and its ancestors have no id, a fresh one is stamped
 * on the node in `spec.json`, whatever other issues the spec has. Answers why
 * when it cannot: the mockup does not exist, nothing is there, the node's ids
 * cannot tell it apart from another node, or the spec does not parse. Writes
 * to one mockup run one at a time, so concurrent calls keep every annotation.
 */
export async function createAnnotation(
  name: MockupName,
  draft: AnnotationDraft,
  mockupsDir = defaultMockupsDir(),
): Promise<AnnotationCreation> {
  if (!(await exists(mockupDirectory(mockupsDir, name)))) {
    return { kind: "no_mockup" };
  }
  return locked(mockupsDir, name, (held) => create(held, draft));
}

/**
 * `annotation` with `change`, pinned on `newest` when it was written before
 * versions. A resolved note keeps the time and version of its first
 * resolution; an open one has neither.
 */
function withStatusAndText(
  annotation: StoredAnnotation,
  change: Pick<AnnotationPatch, "status" | "text">,
  newest: number | undefined,
): StoredAnnotation {
  const { resolvedAt, resolvedVersion, ...rest } = annotation;
  const next = {
    ...rest,
    ...change,
    ...(rest.version === undefined &&
      newest !== undefined && { version: newest }),
  };
  if (next.status === "open") return next;
  const version = resolvedVersion ?? newest;
  return {
    ...next,
    resolvedAt: resolvedAt ?? new Date().toISOString(),
    ...(version !== undefined && { resolvedVersion: version }),
  };
}

async function update(
  held: Held,
  id: string,
  patch: AnnotationPatch,
): Promise<AnnotationUpdate> {
  const file = await readAnnotationsFile(held.path);
  const index = file.annotations.findIndex((note) => note.id === id);
  if (index < 0) return { kind: "no_annotation" };
  const { place, ...change } = patch;
  let updated = withStatusAndText(
    file.annotations[index],
    change,
    await newestVersion(held.mockupsDir, held.name),
  );
  if (place) {
    const anchored = await anchorPlace(held, place);
    if (anchored.kind !== "anchored") return anchored;
    const { state: _drawn, ...pinned } = updated;
    updated = {
      ...pinned,
      anchor: anchored.anchor,
      offset: place.offset,
      ...(place.state !== undefined && { state: place.state }),
    };
  }
  await writeAnnotationsFile(held.path, {
    ...file,
    annotations: file.annotations.map((note, position) =>
      position === index ? updated : note,
    ),
  });
  return { kind: "updated", annotation: await servedNow(held, updated) };
}

/**
 * Changes an annotation's text or status, or pins it at another place, which
 * anchors it as {@link createAnnotation} does. `resolvedAt` and
 * `resolvedVersion` are set while it is resolved. Answers why when it cannot: the mockup or the annotation does
 * not exist, or the place is refused, which changes nothing.
 */
export async function updateAnnotation(
  name: MockupName,
  id: string,
  patch: AnnotationPatch,
  mockupsDir = defaultMockupsDir(),
): Promise<AnnotationUpdate> {
  if (!(await exists(mockupDirectory(mockupsDir, name)))) {
    return { kind: "no_mockup" };
  }
  return locked(mockupsDir, name, (held) => update(held, id, patch));
}

/**
 * Removes an annotation for good. False when the mockup or the annotation
 * does not exist.
 */
export async function deleteAnnotation(
  name: MockupName,
  id: string,
  mockupsDir = defaultMockupsDir(),
): Promise<boolean> {
  if (!(await exists(mockupDirectory(mockupsDir, name)))) return false;
  return locked(mockupsDir, name, async (held) => {
    const file = await readAnnotationsFile(held.path);
    const kept = file.annotations.filter((note) => note.id !== id);
    if (kept.length === file.annotations.length) return false;
    await writeAnnotationsFile(held.path, { ...file, annotations: kept });
    return true;
  });
}
