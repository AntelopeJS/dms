import { isDeepStrictEqual } from "node:util";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { z } from "zod";
import { JsonValueSchema } from "../json";

const pointer = z.string().regex(/^(?:\/[^/]*)*$/, "must be a JSON pointer");
const target = { path: pointer };
const source = { ...target, from: pointer };
const ARRAY_INDEX = /^(?:0|[1-9]\d*)$/;

/** One RFC 6902 operation. */
export const patchOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), ...target, value: JsonValueSchema }),
  z.object({ op: z.literal("replace"), ...target, value: JsonValueSchema }),
  z.object({ op: z.literal("test"), ...target, value: JsonValueSchema }),
  z.object({ op: z.literal("remove"), ...target }),
  z.object({ op: z.literal("move"), ...source }),
  z.object({ op: z.literal("copy"), ...source }),
]);
export type PatchOperation = z.infer<typeof patchOperationSchema>;

/** What applying a patch gives: the patched document, or the first operation that failed. */
export type PatchResult =
  | { ok: true; document: JsonValue }
  | { ok: false; index: number; message: string };

type Container = JsonValue[] | { [key: string]: JsonValue };

function tokensOf(path: string): string[] {
  if (path === "") return [];
  return path
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function containerAt(document: JsonValue, tokens: string[]): Container {
  let node = document;
  for (const token of tokens) node = memberOf(containerOf(node), token);
  return containerOf(node);
}

function isContainer(node: JsonValue): node is Container {
  return node instanceof Object;
}

function containerOf(node: JsonValue): Container {
  if (isContainer(node)) return node;
  throw new Error("the path runs through a value that has no members");
}

function indexIn(array: JsonValue[], token: string, past: boolean): number {
  const index = Number(token);
  if (!ARRAY_INDEX.test(token) || index > array.length - (past ? 0 : 1)) {
    throw new Error(
      `"${token}" is not an index of an array of ${array.length}`,
    );
  }
  return index;
}

function memberOf(container: Container, token: string): JsonValue {
  if (Array.isArray(container)) {
    const item = container.at(indexIn(container, token, false));
    if (item === undefined) throw new Error(`no member "${token}"`);
    return item;
  }
  if (!Object.hasOwn(container, token)) throw new Error(`no member "${token}"`);
  return container[token];
}

function setMember(
  container: { [key: string]: JsonValue },
  key: string,
  value: JsonValue,
): void {
  Object.defineProperty(container, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function valueAt(document: JsonValue, path: string): JsonValue {
  const tokens = tokensOf(path);
  const last = tokens.pop();
  return last === undefined
    ? document
    : memberOf(containerAt(document, tokens), last);
}

function insert(
  document: JsonValue,
  path: string,
  value: JsonValue,
  replace: boolean,
): JsonValue {
  const tokens = tokensOf(path);
  const last = tokens.pop();
  if (last === undefined) return value;
  const parent = containerAt(document, tokens);
  if (!Array.isArray(parent)) {
    if (replace) memberOf(parent, last);
    setMember(parent, last, value);
  } else if (replace) parent[indexIn(parent, last, false)] = value;
  else
    parent.splice(
      last === "-" ? parent.length : indexIn(parent, last, true),
      0,
      value,
    );
  return document;
}

function remove(document: JsonValue, path: string): JsonValue {
  const tokens = tokensOf(path);
  const last = tokens.pop();
  if (last === undefined) throw new Error("the root cannot be removed");
  const parent = containerAt(document, tokens);
  memberOf(parent, last);
  if (Array.isArray(parent)) parent.splice(indexIn(parent, last, false), 1);
  else delete parent[last];
  return document;
}

function applyOperation(
  document: JsonValue,
  operation: PatchOperation,
): JsonValue {
  switch (operation.op) {
    case "add":
      return insert(document, operation.path, operation.value, false);
    case "replace":
      return insert(document, operation.path, operation.value, true);
    case "remove":
      return remove(document, operation.path);
    case "copy":
      return insert(
        document,
        operation.path,
        structuredClone(valueAt(document, operation.from)),
        false,
      );
    case "move": {
      if (operation.path.startsWith(`${operation.from}/`)) {
        throw new Error("a value cannot move into itself");
      }
      const moved = structuredClone(valueAt(document, operation.from));
      return insert(
        remove(document, operation.from),
        operation.path,
        moved,
        false,
      );
    }
    case "test":
      if (isDeepStrictEqual(valueAt(document, operation.path), operation.value))
        return document;
      throw new Error("the value at the path differs from the tested value");
  }
}

/** Applies `operations` in order to a copy of `document`; the first failure stops it. */
export function applyPatch(
  document: JsonValue,
  operations: PatchOperation[],
): PatchResult {
  let patched = structuredClone(document);
  for (const [index, operation] of operations.entries()) {
    try {
      patched = applyOperation(patched, operation);
    } catch (error) {
      return {
        ok: false,
        index,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return { ok: true, document: patched };
}
