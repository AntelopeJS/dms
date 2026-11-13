import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { MockupName } from "./model";

/** The spec of a mockup, in its directory. */
export const SPEC_FILE = "spec.json";

/** The annotations of a mockup, in its directory. */
export const ANNOTATIONS_FILE = "annotations.json";

/** `mockups/` under the backend's working directory, the project root. */
export function defaultMockupsDir(): string {
  return join(process.cwd(), "mockups");
}

/**
 * The directory of one mockup. A {@link MockupName} has no separator nor dot
 * segment, so the path never leaves `mockupsDir`.
 */
export function mockupDirectory(mockupsDir: string, name: MockupName): string {
  return join(mockupsDir, name);
}

const fsErrorSchema = z.object({ code: z.string().optional() }).catch({});

/** What a filesystem error says of itself. */
export type FsError = z.infer<typeof fsErrorSchema>;

/** The code a thrown filesystem error carries, if any. */
export function parseFsError(error: unknown): FsError {
  return fsErrorSchema.parse(error);
}

/** The code of an error saying the file does not exist. */
export const MISSING_FILE = "ENOENT";

/**
 * Replaces `path` with `content` at once: a reader sees the old file or the
 * new one, never half of it.
 */
export async function writeAtomically(
  path: string,
  content: string,
): Promise<void> {
  const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
