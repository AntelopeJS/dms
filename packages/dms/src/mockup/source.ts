import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { IdStamp } from "./anchor";
import { compileSpec, parseSpec } from "./compile";
import {
  MISSING_FILE,
  mockupDirectory,
  parseFsError,
  SPEC_FILE,
  writeAtomically,
} from "./files";
import type { Json, JsonObject, MockupIssue, MockupName } from "./model";
import { jsonObjectSchema } from "./model";

const JSON_INDENT = 2;
const FIRST_INDENT = /^[ \t]+(?=\S)/m;
const DIGEST_LENGTH = 16;

/** Names one content of `spec.json`: equal digests, equal files. */
export type SpecDigest = string;

/** `spec.json` as written, and the digest of its text. */
export interface SpecSource {
  /** Undefined when the file holds no JSON object. */
  spec: JsonObject | undefined;
  digest: SpecDigest;
}

/** What a write answers: the issues that refused it, or the new digest. */
export type SpecWriteResult =
  | { ok: true; digest: SpecDigest }
  | { ok: false; errors: MockupIssue[] };

function digestOf(text: string): SpecDigest {
  return createHash("sha256")
    .update(text)
    .digest("hex")
    .slice(0, DIGEST_LENGTH);
}

function parseObject(text: string): JsonObject | undefined {
  try {
    const parsed = jsonObjectSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** The text of `spec.json`, or undefined when the mockup has none. */
export async function readSpecText(
  mockupsDir: string,
  name: MockupName,
): Promise<string | undefined> {
  try {
    return await readFile(
      join(mockupDirectory(mockupsDir, name), SPEC_FILE),
      "utf8",
    );
  } catch (error) {
    if (parseFsError(error).code === MISSING_FILE) return undefined;
    throw error;
  }
}

/** `spec.json` as written, or undefined when the mockup has none. */
export async function readSpecSource(
  mockupsDir: string,
  name: MockupName,
): Promise<SpecSource | undefined> {
  const text = await readSpecText(mockupsDir, name);
  if (text === undefined) return undefined;
  return { spec: parseObject(text), digest: digestOf(text) };
}

/** Writes `spec` as {@link writeSpec} does, inside {@link withSpecLock}. */
export type SpecWriter = (spec: Json) => Promise<SpecWriteResult>;

/**
 * Writes `text`, the `spec.json` read inside {@link withSpecLock}, with each
 * stamp's id set on the node its pointer names and nothing else changed: the
 * file keeps its key order and its indentation. It does not compile the spec:
 * a stamp cannot add an issue, so a spec that has issues still takes one.
 */
export type SpecStamper = (
  text: string,
  stamps: readonly IdStamp[],
) => Promise<void>;

const writeTails = new Map<string, Promise<void>>();

/**
 * Runs `run` once every earlier call for the same mockup has settled, so a
 * read of `spec.json` and the write based on it cannot interleave with
 * another writer of this process. `run` receives the writers to use: calling
 * {@link writeSpec} from inside would wait on itself.
 */
export async function withSpecLock<Result>(
  mockupsDir: string,
  name: MockupName,
  run: (write: SpecWriter, stamp: SpecStamper) => Promise<Result>,
): Promise<Result> {
  const key = mockupDirectory(mockupsDir, name);
  const previous = writeTails.get(key) ?? Promise.resolve();
  const turn = previous.then(() =>
    run(writeNow(mockupsDir, name), stampNow(mockupsDir, name)),
  );
  const tail = turn.then(
    () => undefined,
    () => undefined,
  );
  writeTails.set(key, tail);
  try {
    return await turn;
  } finally {
    if (writeTails.get(key) === tail) writeTails.delete(key);
  }
}

async function persist(
  mockupsDir: string,
  name: MockupName,
  spec: Json,
  indent: string | number = JSON_INDENT,
): Promise<SpecDigest> {
  const directory = mockupDirectory(mockupsDir, name);
  const text = `${JSON.stringify(spec, null, indent)}\n`;
  await mkdir(directory, { recursive: true });
  await writeAtomically(join(directory, SPEC_FILE), text);
  return digestOf(text);
}

function writeNow(mockupsDir: string, name: MockupName): SpecWriter {
  return async (spec) => {
    const read = parseSpec(JSON.stringify(spec));
    const issues = read.ok ? compileSpec(name, read.spec).issues : read.issues;
    if (issues.length) {
      return {
        ok: false,
        errors: issues.map(({ path, message }) => ({ path, message })),
      };
    }
    return { ok: true, digest: await persist(mockupsDir, name, spec) };
  };
}

/** Whether `value` is a JSON object, not an array. */
function isJsonObject(value: Json | undefined): value is JsonObject {
  return value instanceof Object && !Array.isArray(value);
}

/** The value `pointer`, whose segments need no unescaping, names in `value`. */
function valueAt(value: Json, pointer: string): Json | undefined {
  return pointer
    .split("/")
    .slice(1)
    .reduce<Json | undefined>((at, segment) => {
      if (Array.isArray(at)) return at[Number(segment)];
      return isJsonObject(at) && Object.hasOwn(at, segment)
        ? at[segment]
        : undefined;
    }, value);
}

function stampNow(mockupsDir: string, name: MockupName): SpecStamper {
  return async (text, stamps) => {
    const spec = jsonObjectSchema.parse(JSON.parse(text));
    for (const { path, id } of stamps) {
      const node = valueAt(spec, path);
      if (!isJsonObject(node)) {
        throw new Error(`${path} names no node of mockups/${name}/spec.json`);
      }
      node.id = id;
    }
    const indent = FIRST_INDENT.exec(text)?.[0] ?? JSON_INDENT;
    await persist(mockupsDir, name, spec, indent);
  };
}

/**
 * Checks `spec` as the watcher does (`parseSpec` on its JSON text, then
 * `compileSpec`) and writes `mockups/<name>/spec.json` only when nothing is
 * wrong. A refused spec leaves the file as it was. Writes to one mockup run
 * one after the other.
 */
export function writeSpec(
  mockupsDir: string,
  name: MockupName,
  spec: Json,
): Promise<SpecWriteResult> {
  return withSpecLock(mockupsDir, name, (write) => write(spec));
}
