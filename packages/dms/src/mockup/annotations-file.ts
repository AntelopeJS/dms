import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { blockAnchorSchema, noteAnchorSchema } from "./anchor";
import {
  ANNOTATIONS_FILE,
  MISSING_FILE,
  parseFsError,
  mockupDirectory,
  writeAtomically,
} from "./files";
import type { MockupName } from "./model";
import { annotationIdSchema } from "./model";

const JSON_INDENT = 2;

/** The version of the annotations file this module writes. */
export const FILE_VERSION = 3;

/** Whether a note is still to be acted on, or done. */
export const statusSchema = z.enum(["open", "resolved"]);
const versionNumberSchema = z.number().int().positive();
const fractionSchema = z.number().min(0).max(1);

/**
 * Where a pin sits on what it is on: fractions of its box, from its top left
 * corner, so the pin stays at the same spot of a block on every frame width.
 */
export const pinOffsetSchema = z
  .object({ x: fractionSchema, y: fractionSchema })
  .strict();
export type PinOffset = z.infer<typeof pinOffsetSchema>;

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
export type StoredAnnotation = z.infer<typeof storedSchema>;

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

/** An annotations file, its notes as stored. */
export interface AnnotationsFile {
  version: typeof FILE_VERSION;
  annotations: StoredAnnotation[];
}

/**
 * The last write of each annotations file, settled either way: the next
 * write of that file starts once it is done.
 */
const queues = new Map<string, Promise<void>>();

export function serialized<T>(
  path: string,
  task: () => Promise<T>,
): Promise<T> {
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

export async function exists(directory: string): Promise<boolean> {
  try {
    return (await stat(directory)).isDirectory();
  } catch (error) {
    if (parseFsError(error).code === MISSING_FILE) return false;
    throw error;
  }
}

export async function readAnnotationsFile(
  path: string,
): Promise<AnnotationsFile> {
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

export function writeAnnotationsFile(
  path: string,
  file: AnnotationsFile,
): Promise<void> {
  return writeAtomically(path, `${JSON.stringify(file, null, JSON_INDENT)}\n`);
}

export function annotationsPath(mockupsDir: string, name: MockupName): string {
  return join(mockupDirectory(mockupsDir, name), ANNOTATIONS_FILE);
}
