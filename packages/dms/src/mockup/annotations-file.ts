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
export const FILE_VERSION = 4;

/** The version before authors and replies: its notes read as unsigned, with no reply. */
const UNSIGNED_VERSION = 3;

/** Whether a note is still to be acted on, or done. */
export const statusSchema = z.enum(["open", "resolved"]);
const versionNumberSchema = z.number().int().positive();
const fractionSchema = z.number().min(0).max(1);

/** Who wrote a note or a reply: the signed-in user, and the name the others see. */
export const noteAuthorSchema = z
  .object({ userId: z.string(), name: z.string() })
  .strict();
export type NoteAuthor = z.infer<typeof noteAuthorSchema>;

/** One reply under a note. */
const replySchema = z.object({
  id: annotationIdSchema,
  author: noteAuthorSchema,
  text: z.string(),
  createdAt: z.string(),
});
export type StoredReply = z.infer<typeof replySchema>;

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
  /** Who pinned the note; absent on a note written before authors. */
  author: noteAuthorSchema.optional(),
  /** Who resolved the note, while it is resolved; absent when the AI did, or before authors. */
  resolvedBy: noteAuthorSchema.optional(),
  /** The replies under the note, oldest first. */
  replies: z.array(replySchema).default([]),
});
export type StoredAnnotation = z.infer<typeof storedSchema>;

/** Where a note of a version 2 file sits on its block: that version had no offset. */
const VERSION_2_OFFSET: PinOffset = { x: 0, y: 0 };

/**
 * An annotations file as stored, an older file read as the current version: a
 * version 3 file's notes have no author and no reply, a version 2 file's sit
 * at the top left corner of their block too.
 */
const annotationsFileSchema = z.union([
  z
    .object({
      version: z.union([z.literal(UNSIGNED_VERSION), z.literal(FILE_VERSION)]),
      annotations: z.array(storedSchema),
    })
    .transform(({ annotations }): AnnotationsFile => ({
      version: FILE_VERSION,
      annotations,
    })),
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
