import { randomBytes } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStoreConfig } from "../config";
import type { DesiredModule, DesiredState } from "./types";

/**
 * Not `antelope.<name>.json`: the core reads those as configuration overrides
 * of the module of that name.
 */
export const DEFAULT_STATE_FILE = "dms-modules.json";
const FILE_ENCODING = "utf-8";
const JSON_INDENT = 2;
const TEMP_SUFFIX_BYTES = 6;
const MISSING_FILE_CODE = "ENOENT";

/** The desired-state file, relative to the project folder. */
export function stateFileName(): string {
  return getStoreConfig().stateFile ?? DEFAULT_STATE_FILE;
}

export function stateFilePath(projectPath: string): string {
  return path.resolve(projectPath, stateFileName());
}

function emptyState(): DesiredState {
  return { modules: {} };
}

function isDesiredModule(value: unknown): value is DesiredModule {
  const entry = value as Partial<DesiredModule> | null;
  return (
    typeof entry?.package === "string" &&
    typeof entry.version === "string" &&
    typeof entry.enabled === "boolean"
  );
}

/**
 * The state a file holds. An entry missing a field is an error, not skipped:
 * the file is edited by hand, and a typo must not silently uninstall a module.
 */
export function parseDesiredState(content: string): DesiredState {
  const parsed = JSON.parse(content) as Partial<DesiredState> | null;
  const modules = parsed?.modules ?? {};
  for (const [id, entry] of Object.entries(modules)) {
    if (!isDesiredModule(entry)) {
      throw new Error(
        `${stateFileName()}: module "${id}" needs a package, a version and enabled`,
      );
    }
  }
  return { modules };
}

/** The desired state, empty when the file does not exist yet. */
export async function readDesiredState(
  projectPath: string,
): Promise<DesiredState> {
  try {
    return parseDesiredState(
      await readFile(stateFilePath(projectPath), FILE_ENCODING),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === MISSING_FILE_CODE) {
      return emptyState();
    }
    throw error;
  }
}

/**
 * Writes the desired state through a temporary file renamed over the real
 * one, so a crash never leaves a half-written file behind.
 */
export async function writeDesiredState(
  projectPath: string,
  state: DesiredState,
): Promise<void> {
  const target = stateFilePath(projectPath);
  const temporary = `${target}.${randomBytes(TEMP_SUFFIX_BYTES).toString("hex")}.tmp`;
  const sorted: DesiredState = {
    modules: Object.fromEntries(
      Object.entries(state.modules).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
  try {
    await writeFile(
      temporary,
      `${JSON.stringify(sorted, null, JSON_INDENT)}\n`,
      FILE_ENCODING,
    );
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
