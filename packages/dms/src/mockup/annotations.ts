import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  anchorSite,
  type BlockAnchor,
  blockAnchorSchema,
  type BlockTree,
  locateBlock,
  type NodeSite,
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
import type { MockupIssue, MockupName, MockupSpec } from "./model";
import { annotationIdSchema, pageIdSchema } from "./model";
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

const textSchema = z.string().trim().min(1).max(MAX_TEXT);
const statusSchema = z.enum(["open", "resolved"]);

/** A spec JSON pointer: `""` or `/`-led segments. */
const pointerSchema = z
  .string()
  .max(MAX_POINTER)
  .regex(/^(?:\/[^/]*)*$/);

/** What a reviewer posts to annotate a node: a pointer into the current spec. */
export const annotationDraftSchema = z
  .object({ page: pageIdSchema, path: pointerSchema, text: textSchema })
  .strict();
export type AnnotationDraft = z.infer<typeof annotationDraftSchema>;

/** What an update may change of an annotation. */
export const annotationPatchSchema = z
  .object({ status: statusSchema.optional(), text: textSchema.optional() })
  .strict();
export type AnnotationPatch = z.infer<typeof annotationPatchSchema>;

const noteFields = {
  id: annotationIdSchema,
  text: z.string(),
  status: statusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().optional(),
};

const storedSchema = z.object({
  ...noteFields,
  anchor: blockAnchorSchema.optional(),
});

const legacySchema = z.object({
  ...noteFields,
  page: pageIdSchema,
  path: pointerSchema,
});

const annotationsFileSchema = z.discriminatedUnion("version", [
  z.object({ version: z.literal(1), annotations: z.array(legacySchema) }),
  z.object({ version: z.literal(2), annotations: z.array(storedSchema) }),
]);

/**
 * A reviewer's note on one block of a mockup. A version 2 file stores
 * `anchor` and no location. `page` and `path` are the block's location in the
 * spec now, set when a note is served and absent when its block was removed.
 * A note of a version 1 file keeps the `page` and `path` it was saved with
 * until the file is migrated.
 */
export type MockupAnnotation = z.infer<typeof storedSchema> & Partial<NodeSite>;

/** An annotations file of either version, its notes as stored. */
interface AnnotationsFile {
  version: 1 | 2;
  annotations: MockupAnnotation[];
}

/** What creating an annotation answers. */
export type AnnotationCreation =
  | { kind: "created"; annotation: MockupAnnotation }
  | { kind: "no_mockup" }
  | { kind: "no_node" }
  | { kind: "spec_invalid"; errors: MockupIssue[] };

const MISSING_SPEC: MockupIssue = {
  path: "",
  message: "the mockup has no spec.json",
};

/** The spec of a held mockup, read as it must be to take a stamped id. */
type StrictSpec =
  | { kind: "read"; spec: MockupSpec }
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
      return { version: 2, annotations: [] };
    }
    throw error;
  }
  const parsed = annotationsFileSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error(
      `${path} is not an annotations file: ${parsed.error.message}`,
    );
  }
  const { version, annotations } = parsed.data;
  return { version, annotations };
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
    ? { kind: "read", spec: read.spec }
    : { kind: "invalid", errors: read.issues };
}

/** The note as a version 2 file stores it: its anchor and no location. */
function stored(
  note: MockupAnnotation,
  anchor: BlockAnchor | undefined,
): MockupAnnotation {
  const { id, text, status, createdAt, resolvedAt } = note;
  const next: MockupAnnotation = { id, text, status, createdAt };
  if (resolvedAt !== undefined) next.resolvedAt = resolvedAt;
  if (anchor) next.anchor = anchor;
  return next;
}

/** The file of a held mockup, and why a version 1 file could not become version 2. */
interface Current {
  file: AnnotationsFile;
  errors: MockupIssue[];
}

/**
 * The annotations file of a held mockup. A version 1 file is migrated here:
 * each note's pointer is located in the current spec and anchored, every
 * stamped id lands in one spec write, then the file is rewritten as version
 * 2. A crash between the two writes leaves stamps the next run finds again.
 * When the spec cannot be read, the file stays version 1 and `errors` says
 * why.
 */
async function currentFile(held: Held): Promise<Current> {
  const file = await readAnnotationsFile(held.path);
  if (file.version === 2) return { file, errors: [] };
  const read = await readStrictSpec(held);
  if (read.kind !== "read") {
    return {
      file,
      errors: read.kind === "missing" ? [MISSING_SPEC] : read.errors,
    };
  }
  const { spec } = read;
  const anchored = file.annotations.map((note) => ({
    note,
    result:
      note.page === undefined || note.path === undefined
        ? undefined
        : anchorSite(spec, { page: note.page, path: note.path }),
  }));
  if (anchored.some(({ result }) => result?.stamped)) {
    await held.stamp(spec);
  }
  const migrated: AnnotationsFile = {
    version: 2,
    annotations: anchored.map(({ note, result }) =>
      stored(note, result?.anchor),
    ),
  };
  await writeAnnotationsFile(held.path, migrated);
  return { file: migrated, errors: [] };
}

/** `note` placed where its block is in `tree` now; as stored when it has no anchor or its block is gone. */
function resolved(
  note: MockupAnnotation,
  tree: BlockTree | undefined,
): MockupAnnotation {
  const site = tree && note.anchor ? locateBlock(tree, note.anchor) : undefined;
  return site ? { ...note, ...site } : note;
}

/** The spec of a mockup as it is written now, however wrong, or undefined when it holds no object. */
async function currentTree(
  mockupsDir: string,
  name: MockupName,
): Promise<BlockTree | undefined> {
  return viewOf((await readSpecSource(mockupsDir, name))?.spec);
}

/**
 * The annotations of a mockup, oldest first, each placed where its block is
 * in the spec now, or undefined when the mockup does not exist. A note whose
 * block was removed has no `page` or `path`. The first read of a version 1
 * file migrates it.
 */
export async function listAnnotations(
  name: MockupName,
  mockupsDir = defaultMockupsDir(),
): Promise<MockupAnnotation[] | undefined> {
  if (!(await exists(mockupDirectory(mockupsDir, name)))) return undefined;
  const read = await readAnnotationsFile(annotationsPath(mockupsDir, name));
  const { file } =
    read.version === 1
      ? await locked(mockupsDir, name, currentFile)
      : { file: read };
  const tree = await currentTree(mockupsDir, name);
  return file.annotations.map((note) => resolved(note, tree));
}

async function create(
  held: Held,
  draft: AnnotationDraft,
): Promise<AnnotationCreation> {
  const { file, errors } = await currentFile(held);
  if (errors.length) return { kind: "spec_invalid", errors };
  const read = await readStrictSpec(held);
  if (read.kind === "missing") return { kind: "no_node" };
  if (read.kind === "invalid") {
    return { kind: "spec_invalid", errors: read.errors };
  }
  const { spec } = read;
  const anchored = anchorSite(spec, draft);
  if (!anchored) return { kind: "no_node" };
  if (anchored.stamped) await held.stamp(spec);
  const note: MockupAnnotation = {
    id: randomBytes(ID_BYTES).toString("base64url"),
    anchor: anchored.anchor,
    text: draft.text,
    status: "open",
    createdAt: new Date().toISOString(),
  };
  await writeAnnotationsFile(held.path, {
    version: 2,
    annotations: [...file.annotations, note],
  });
  return { kind: "created", annotation: resolved(note, spec) };
}

/**
 * Adds an open annotation on the node the draft's page and pointer name in
 * the current spec. The note is anchored to that node's block: when the node
 * and its ancestors have no id, a fresh one is stamped on the node in
 * `spec.json`, whatever other issues the spec has. Answers why when it
 * cannot: the mockup does not exist, no node is there, or the spec does not
 * parse. Writes to one mockup run one at a time, so concurrent calls keep
 * every annotation.
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

function patched(
  annotation: MockupAnnotation,
  patch: AnnotationPatch,
): MockupAnnotation {
  const { resolvedAt, ...rest } = annotation;
  const next = { ...rest, ...patch };
  if (next.status === "open") return next;
  return { ...next, resolvedAt: resolvedAt ?? new Date().toISOString() };
}

/**
 * Changes an annotation's text or status, or answers undefined when the
 * mockup or the annotation does not exist. `resolvedAt` is set while it is
 * resolved.
 */
export async function updateAnnotation(
  name: MockupName,
  id: string,
  patch: AnnotationPatch,
  mockupsDir = defaultMockupsDir(),
): Promise<MockupAnnotation | undefined> {
  if (!(await exists(mockupDirectory(mockupsDir, name)))) return undefined;
  return locked(mockupsDir, name, async (held) => {
    const { file } = await currentFile(held);
    const index = file.annotations.findIndex(
      (annotation) => annotation.id === id,
    );
    if (index < 0) return undefined;
    const updated = patched(file.annotations[index], patch);
    await writeAnnotationsFile(held.path, {
      ...file,
      annotations: file.annotations.map((annotation, position) =>
        position === index ? updated : annotation,
      ),
    });
    return resolved(updated, await currentTree(held.mockupsDir, held.name));
  });
}
