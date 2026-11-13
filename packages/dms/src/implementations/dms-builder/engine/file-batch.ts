import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FileChange } from "@antelopejs/interface-dms-builder";
import { diffText } from "./writable";

type FileContent = string | Buffer;

interface FileSnapshot {
  path: string;
  /** Undefined when the file did not exist. */
  before: Buffer | undefined;
}

export interface ErrorWithRollbackErrors {
  rollbackErrors?: unknown[];
}

const TEMPORARY_NAME_BYTES = 6;

function readBytes(filePath: string): Buffer | undefined {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return undefined;
  }
}

function toBytes(content: FileContent): Buffer {
  return Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
}

/** Best effort: the write's own failure is the one worth reporting, not this one. */
function discardTemporary(temporaryPath: string): void {
  try {
    fs.rmSync(temporaryPath, { force: true });
  } catch {}
}

/**
 * Writes to a temporary file beside the target, then renames it over the
 * target: the dev server watching the layer never reads a half-written file,
 * and a failed write leaves the previous content in place.
 */
function writeFileAtomically(filePath: string, bytes: Buffer): void {
  const suffix = randomBytes(TEMPORARY_NAME_BYTES).toString("hex");
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${suffix}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, bytes);
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    discardTemporary(temporaryPath);
    throw error;
  }
}

/**
 * Create a directory and its missing parents. Returns the ones created,
 * outermost first, so a rollback removes exactly those.
 */
function makeDirectory(directory: string): string[] {
  const firstCreated = fs.mkdirSync(directory, { recursive: true });
  if (firstCreated === undefined) {
    return [];
  }
  const outermost = path.resolve(firstCreated);
  const created: string[] = [];
  let current = path.resolve(directory);
  while (current !== outermost && path.dirname(current) !== current) {
    created.unshift(current);
    current = path.dirname(current);
  }
  created.unshift(outermost);
  return created;
}

/** A directory something else added to since stays. */
function removeIfEmpty(directory: string): void {
  try {
    fs.rmdirSync(directory);
  } catch {}
}

function restore(snapshot: FileSnapshot): void {
  if (snapshot.before === undefined) {
    fs.rmSync(snapshot.path, { force: true });
    return;
  }
  writeFileAtomically(snapshot.path, snapshot.before);
}

/** Attaches `rollbackErrors` to the error a failed write threw, when any rollback failed too. */
export function attachRollbackErrors(
  error: Error,
  rollbackErrors: unknown[],
): void {
  if (rollbackErrors.length > 0) {
    Object.assign(error, { rollbackErrors } satisfies ErrorWithRollbackErrors);
  }
}

function describeChange(
  filePath: string,
  before: Buffer | undefined,
  content: FileContent | null,
): FileChange {
  const kind = content === null ? "delete" : before ? "modify" : "create";
  if (content === null) {
    return { path: filePath, kind, diff: "" };
  }
  const diff = Buffer.isBuffer(content)
    ? `binary file, ${content.length} bytes`
    : diffText(before?.toString("utf8") ?? "", content);
  return { path: filePath, kind, diff };
}

/**
 * Files written together or not at all: text and binary alike, outside the
 * TypeScript project a `Transaction` stages. Nothing touches the disk until
 * `flush`, a file whose content would not change is left alone, and a write
 * that fails part way puts back every file the batch had already written and
 * removes the directories it created.
 */
export class FileBatch {
  /** `null` stages a removal. */
  private readonly stagedContentByPath = new Map<string, FileContent | null>();
  private snapshots: FileSnapshot[] = [];
  private createdDirectories: string[] = [];

  public stageWrite(filePath: string, content: FileContent): void {
    this.stagedContentByPath.set(filePath, content);
  }

  public stageRemoval(filePath: string): void {
    this.stagedContentByPath.set(filePath, null);
  }

  /**
   * On failure, rolls back what it already wrote, then rethrows the original
   * error with any rollback errors attached.
   */
  public flush(): FileChange[] {
    this.snapshots = [];
    this.createdDirectories = [];
    const changes: FileChange[] = [];
    try {
      for (const [filePath, content] of this.stagedContentByPath) {
        const change = this.apply(filePath, content);
        if (change) {
          changes.push(change);
        }
      }
    } catch (error) {
      const rollbackErrors = this.rollback();
      if (error instanceof Error) {
        attachRollbackErrors(error, rollbackErrors);
      }
      throw error;
    }
    return changes;
  }

  /**
   * Restore every file the last `flush` wrote and remove the directories it
   * created that are still empty: after a failed flush, or when the caller's
   * next step fails. Best effort: a file that cannot be restored does not stop
   * the others, and the errors are returned, not thrown, so they never hide
   * the error that triggered the rollback.
   */
  public rollback(): unknown[] {
    const failures: unknown[] = [];
    for (const snapshot of this.snapshots.reverse()) {
      try {
        restore(snapshot);
      } catch (error) {
        failures.push(error);
      }
    }
    for (const directory of this.createdDirectories.reverse()) {
      removeIfEmpty(directory);
    }
    this.snapshots = [];
    this.createdDirectories = [];
    return failures;
  }

  private apply(
    filePath: string,
    content: FileContent | null,
  ): FileChange | undefined {
    const before = readBytes(filePath);
    const unchanged =
      content === null
        ? before === undefined
        : before?.equals(toBytes(content));
    if (unchanged) {
      return undefined;
    }
    if (content === null) {
      this.snapshots.push({ path: filePath, before });
      fs.rmSync(filePath, { force: true });
    } else {
      this.createdDirectories.push(...makeDirectory(path.dirname(filePath)));
      this.snapshots.push({ path: filePath, before });
      writeFileAtomically(filePath, toBytes(content));
    }
    return describeChange(filePath, before, content);
  }
}
