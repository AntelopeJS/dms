import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  ANNOTATIONS_FILE,
  defaultMockupsDir,
  MISSING_FILE,
  parseFsError,
  mockupDirectory,
  writeAtomically,
} from "./files";
import type { MockupName } from "./model";
import { annotationIdSchema, pageIdSchema } from "./model";

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

/** What a reviewer posts to annotate a node. */
export const annotationDraftSchema = z
  .object({ page: pageIdSchema, path: pointerSchema, text: textSchema })
  .strict();
export type AnnotationDraft = z.infer<typeof annotationDraftSchema>;

/** What an update may change of an annotation. */
export const annotationPatchSchema = z
  .object({ status: statusSchema.optional(), text: textSchema.optional() })
  .strict();
export type AnnotationPatch = z.infer<typeof annotationPatchSchema>;

const annotationSchema = z.object({
  id: annotationIdSchema,
  page: pageIdSchema,
  path: pointerSchema,
  text: z.string(),
  status: statusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().optional(),
});

/** A reviewer's note on one node of a mockup page. */
export type MockupAnnotation = z.infer<typeof annotationSchema>;

const annotationsFileSchema = z.object({
  version: z.literal(1),
  annotations: z.array(annotationSchema),
});

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

async function readAnnotationsFile(path: string): Promise<MockupAnnotation[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (parseFsError(error).code === MISSING_FILE) return [];
    throw error;
  }
  const parsed = annotationsFileSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error(
      `${path} is not an annotations file: ${parsed.error.message}`,
    );
  }
  return parsed.data.annotations;
}

function writeAnnotationsFile(
  path: string,
  annotations: MockupAnnotation[],
): Promise<void> {
  const content = { version: 1, annotations };
  return writeAtomically(
    path,
    `${JSON.stringify(content, null, JSON_INDENT)}\n`,
  );
}

function annotationsPath(mockupsDir: string, name: MockupName): string {
  return join(mockupDirectory(mockupsDir, name), ANNOTATIONS_FILE);
}

/**
 * The annotations of a mockup, oldest first, or undefined when the mockup
 * does not exist.
 */
export async function listAnnotations(
  name: MockupName,
  mockupsDir = defaultMockupsDir(),
): Promise<MockupAnnotation[] | undefined> {
  if (!(await exists(mockupDirectory(mockupsDir, name)))) return undefined;
  return readAnnotationsFile(annotationsPath(mockupsDir, name));
}

/**
 * Adds an open annotation, or answers undefined when the mockup does not
 * exist. Writes to one mockup run one at a time, so concurrent calls keep
 * every annotation.
 */
export async function createAnnotation(
  name: MockupName,
  draft: AnnotationDraft,
  mockupsDir = defaultMockupsDir(),
): Promise<MockupAnnotation | undefined> {
  if (!(await exists(mockupDirectory(mockupsDir, name)))) return undefined;
  const path = annotationsPath(mockupsDir, name);
  return serialized(path, async () => {
    const annotation: MockupAnnotation = {
      id: randomBytes(ID_BYTES).toString("base64url"),
      ...draft,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    const annotations = await readAnnotationsFile(path);
    await writeAnnotationsFile(path, [...annotations, annotation]);
    return annotation;
  });
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
  const path = annotationsPath(mockupsDir, name);
  return serialized(path, async () => {
    const annotations = await readAnnotationsFile(path);
    const index = annotations.findIndex((annotation) => annotation.id === id);
    if (index < 0) return undefined;
    const updated = patched(annotations[index], patch);
    await writeAnnotationsFile(
      path,
      annotations.map((annotation, position) =>
        position === index ? updated : annotation,
      ),
    );
    return updated;
  });
}
