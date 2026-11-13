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
import type {
  Json,
  JsonObject,
  MockupIssue,
  MockupName,
  MockupSpec,
} from "./model";
import { jsonObjectSchema } from "./model";

const JSON_INDENT = 2;
const FIRST_INDENT = /^[ \t]+(?=\S)/m;
const TAB = "\t";
const LEADING_TABS = /^\t+/gm;
const LF = "\n";
const CRLF = "\r\n";
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
export type SpecWriter = (spec: Json | MockupSpec) => Promise<SpecWriteResult>;

/**
 * Writes `text`, the `spec.json` read inside {@link withSpecLock}, with each
 * stamp's id added as the last key of the node its pointer names. The file
 * keeps its layout: one line when it was one line, else the indentation of
 * its first indented line; CRLF line endings when it had any; a final line
 * ending when it had one. Everything else is written as `JSON.stringify`
 * writes the parsed file: keys keep their order, except that keys which are
 * whole numbers, such as `"2024"`, move first in their object, and spacing
 * within a line, number spellings and string escapes take its form. It does
 * not compile the spec: a stamp cannot add an issue, so a spec that has
 * issues still takes one.
 */
export type SpecStamper = (
  text: string,
  stamps: readonly IdStamp[],
) => Promise<void>;

/** A value to write into `spec.json`: member `key` of the object at JSON pointer `path`. */
interface SpecValue {
  path: string;
  key: string;
  value: Json;
}

/**
 * Writes `text`, the `spec.json` read inside {@link withSpecLock}, with each
 * value set at its place, laid out as a {@link SpecStamper} writes. A new
 * member goes last in its object; an existing one keeps its place. It does
 * not compile the spec.
 */
export type SpecSetter = (
  text: string,
  values: readonly SpecValue[],
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
  run: (
    write: SpecWriter,
    stamp: SpecStamper,
    set: SpecSetter,
  ) => Promise<Result>,
): Promise<Result> {
  const key = mockupDirectory(mockupsDir, name);
  const previous = writeTails.get(key) ?? Promise.resolve();
  const set = setNow(mockupsDir, name);
  const turn = previous.then(() =>
    run(
      writeNow(mockupsDir, name),
      (text, stamps) =>
        set(
          text,
          stamps.map(({ path, id }) => ({ path, key: "id", value: id })),
        ),
      set,
    ),
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
  text: string,
): Promise<SpecDigest> {
  const directory = mockupDirectory(mockupsDir, name);
  await mkdir(directory, { recursive: true });
  await writeAtomically(join(directory, SPEC_FILE), text);
  return digestOf(text);
}

/** `spec` as JSON text laid out as `text` is: see {@link SpecStamper}. */
function laidOutAs(text: string, spec: Json): string {
  const body = text.trimEnd();
  const indent = body.includes(LF)
    ? (FIRST_INDENT.exec(body)?.[0] ?? " ".repeat(JSON_INDENT))
    : undefined;
  const eol = text.includes(CRLF) ? CRLF : LF;
  const json = (
    indent === undefined
      ? JSON.stringify(spec)
      : JSON.stringify(spec, null, TAB).replaceAll(LEADING_TABS, (tabs) =>
          indent.repeat(tabs.length),
        )
  ).replaceAll(LF, eol);
  return text.endsWith(LF) ? `${json}${eol}` : json;
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
    const text = `${JSON.stringify(spec, null, JSON_INDENT)}${LF}`;
    return { ok: true, digest: await persist(mockupsDir, name, text) };
  };
}

function isJsonObject(value: Json | undefined): value is JsonObject {
  return value instanceof Object && !Array.isArray(value);
}

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

function setNow(mockupsDir: string, name: MockupName): SpecSetter {
  return async (text, values) => {
    const spec = jsonObjectSchema.parse(JSON.parse(text));
    for (const { path, key, value } of values) {
      const object = valueAt(spec, path);
      if (!isJsonObject(object)) {
        throw new Error(`${path} names no node of mockups/${name}/spec.json`);
      }
      object[key] = value;
    }
    await persist(mockupsDir, name, laidOutAs(text, spec));
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
  spec: Json | MockupSpec,
): Promise<SpecWriteResult> {
  return withSpecLock(mockupsDir, name, (write) => write(spec));
}
