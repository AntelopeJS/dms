import { randomBytes } from "node:crypto";
import { cp, rename, rm, stat, writeFile } from "node:fs/promises";
import { removeHistory, renameHistory } from "./history";
import { join } from "node:path";
import {
  ANNOTATIONS_FILE,
  MISSING_FILE,
  mockupDirectory,
  parseFsError,
  SPEC_FILE,
} from "./files";
import { type MockupName, parseMockupName } from "./model";
import { parseSpecObject, readSpecText, withSpecLock } from "./source";

const JSON_INDENT = 2;
const COPY_SUFFIX = "-copy";
const MAX_COPY_ATTEMPTS = 100;
const MAX_NAME_LENGTH = 64;
const TEMPORARY_SUFFIX = ".tmp";
const EXISTING_DIRECTORY_CODES: readonly string[] = ["EEXIST", "ENOTEMPTY"];

/** Why a rename, a duplicate or a delete changed nothing. */
export type ManageRefusal = { kind: "no_mockup" } | { kind: "exists" };

/** What a rename, a duplicate or a delete answers. */
export type ManageResult<Done = object> =
  | ({ kind: "done" } & Done)
  | ManageRefusal;

/** The mockup a rename or a duplicate leaves, by its name. */
export interface MockupNamed {
  name: MockupName;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (parseFsError(error).code === MISSING_FILE) return false;
    throw error;
  }
}

/**
 * Renames mockup `name`: its title when `change.title` is given, then its
 * folder when `change.name` is given. The new name is a valid
 * {@link MockupName}, which no other directory of `mockupsDir` has.
 */
export function renameMockup(
  mockupsDir: string,
  name: MockupName,
  change: { name?: MockupName; title?: string },
): Promise<ManageResult<MockupNamed>> {
  return withSpecLock(mockupsDir, name, async (_write, _stamp, set) => {
    const text = await readSpecText(mockupsDir, name);
    if (text === undefined) return { kind: "no_mockup" };
    const target = change.name ?? name;
    if (
      target !== name &&
      (await exists(mockupDirectory(mockupsDir, target)))
    ) {
      return { kind: "exists" };
    }
    if (change.title !== undefined && parseSpecObject(text)) {
      await set(text, [{ path: "", key: "title", value: change.title }]);
    }
    if (target !== name) {
      await rename(
        mockupDirectory(mockupsDir, name),
        mockupDirectory(mockupsDir, target),
      );
      await renameHistory(mockupsDir, name, target);
    }
    return { kind: "done", name: target };
  });
}

/** Deletes the folder of mockup `name`: its spec, its comments, whatever else it holds. */
export function deleteMockup(
  mockupsDir: string,
  name: MockupName,
): Promise<ManageResult> {
  return withSpecLock(mockupsDir, name, async () => {
    if ((await readSpecText(mockupsDir, name)) === undefined) {
      return { kind: "no_mockup" };
    }
    await rm(mockupDirectory(mockupsDir, name), {
      recursive: true,
      force: true,
    });
    await removeHistory(mockupsDir, name);
    return { kind: "done" };
  });
}

/** The first `<name>-copy`, `<name>-copy-2`… no directory of `mockupsDir` has. */
async function freeCopyName(
  mockupsDir: string,
  name: MockupName,
): Promise<MockupName | undefined> {
  for (let attempt = 1; attempt <= MAX_COPY_ATTEMPTS; attempt++) {
    const suffix = attempt === 1 ? COPY_SUFFIX : `${COPY_SUFFIX}-${attempt}`;
    const candidate = parseMockupName(
      `${name.slice(0, MAX_NAME_LENGTH - suffix.length)}${suffix}`,
    );
    if (candidate && !(await exists(mockupDirectory(mockupsDir, candidate)))) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * The spec of a copy: the same pages, no longer built. The pages it built
 * belong to the mockup it was copied from, so the copy starts as a draft.
 */
function copiedSpecText(text: string): string {
  const spec = parseSpecObject(text);
  if (!spec || !Object.hasOwn(spec, "built")) return text;
  const unbuilt = Object.fromEntries(
    Object.entries(spec).filter(([key]) => key !== "built"),
  );
  return `${JSON.stringify(unbuilt, null, JSON_INDENT)}\n`;
}

/**
 * Copies mockup `name` as `target`, or as the first free `<name>-copy` when
 * `target` is not given. The copy has the files of the original but its
 * comments, and starts as a draft.
 */
export async function duplicateMockup(
  mockupsDir: string,
  name: MockupName,
  target?: MockupName,
): Promise<ManageResult<MockupNamed> | { kind: "no_free_name" }> {
  const text = await readSpecText(mockupsDir, name);
  if (text === undefined) return { kind: "no_mockup" };
  const copy = target ?? (await freeCopyName(mockupsDir, name));
  if (!copy) return { kind: "no_free_name" };
  const destination = mockupDirectory(mockupsDir, copy);
  if (await exists(destination)) return { kind: "exists" };
  const staging = join(
    mockupsDir,
    `.copy-${randomBytes(6).toString("hex")}${TEMPORARY_SUFFIX}`,
  );
  try {
    await cp(mockupDirectory(mockupsDir, name), staging, {
      recursive: true,
      filter: (source) =>
        source !== join(mockupDirectory(mockupsDir, name), ANNOTATIONS_FILE),
    });
    await writeFile(join(staging, SPEC_FILE), copiedSpecText(text), "utf8");
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (EXISTING_DIRECTORY_CODES.includes(parseFsError(error).code ?? "")) {
      return { kind: "exists" };
    }
    throw error;
  }
  return { kind: "done", name: copy };
}
