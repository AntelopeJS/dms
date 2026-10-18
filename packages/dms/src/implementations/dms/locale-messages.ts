import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GetFrontendModules } from "./frontend-modules";

/** A locale file's content: nested message objects, strings at the leaves. */
export type LocaleMessages = Record<string, unknown>;

/** The language every catalog falls back to, as the frontend's i18n does. */
export const FALLBACK_MESSAGE_LANGUAGE = "en";

// The renderer's discovery rule, repeated here so the server reads the same
// catalogs the browser does: `i18n/locales/**` under the module, or under each
// of its `layers/*` when it has some, a file per language named `*-ll-CC.json`.
const LAYERS_DIRECTORY = "layers";
const LOCALE_DIRECTORY = join("i18n", "locales");
const LOCALE_FILE = /(?:^|[/\\-])([a-z]{2})-[A-Z]{2}\.json$/;

function assetRoots(moduleRoot: string): string[] {
  const layersRoot = join(moduleRoot, LAYERS_DIRECTORY);
  if (!existsSync(layersRoot)) return [moduleRoot];
  return readdirSync(layersRoot)
    .sort()
    .map((name) => join(layersRoot, name));
}

function collectFiles(directory: string): string[] {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return [];
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .map((file) => join(directory, file))
    .filter((file) => file.endsWith(".json"))
    .sort();
}

function isRecord(value: unknown): value is LocaleMessages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The first file to define a key keeps it, as the renderer merges them.
function mergeMissing(target: LocaleMessages, source: LocaleMessages): void {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (existing === undefined) {
      target[key] = value;
    } else if (isRecord(existing) && isRecord(value)) {
      mergeMissing(existing, value);
    }
  }
}

function readLocaleFile(path: string): LocaleMessages | undefined {
  try {
    const content: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(content) ? content : undefined;
  } catch {
    // The frontend build reports a broken catalog; a text falls back to its key.
    return undefined;
  }
}

/**
 * The messages of `language` the frontend modules at `sourcePaths` ship, in
 * that order, merged as the frontend merges them.
 */
export function readModuleLocaleMessages(
  sourcePaths: string[],
  language: string,
): LocaleMessages {
  const messages: LocaleMessages = {};
  for (const sourcePath of sourcePaths) {
    for (const root of assetRoots(sourcePath)) {
      for (const file of collectFiles(join(root, LOCALE_DIRECTORY))) {
        if (file.match(LOCALE_FILE)?.[1] !== language) continue;
        const content = readLocaleFile(file);
        if (content) mergeMissing(messages, content);
      }
    }
  }
  return messages;
}

/**
 * The messages of `language` the registered frontend modules ship. Read from
 * their sources on each call: the catalogs change with a module reload, and a
 * caller (an export job) reads them once per run.
 */
export function readLocaleMessages(language: string): LocaleMessages {
  return readModuleLocaleMessages(
    GetFrontendModules().map((module) => module.sourcePath),
    language,
  );
}

/** The message at a dotted key path, when it is a text. */
export function lookupMessage(
  messages: LocaleMessages,
  key: string,
): string | undefined {
  let node: unknown = messages;
  for (const segment of key.split(".")) {
    if (!isRecord(node)) return undefined;
    node = node[segment];
  }
  return typeof node === "string" ? node : undefined;
}
