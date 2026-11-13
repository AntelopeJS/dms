import { type DataType, getDataTypeId } from "../data-types";
import { isObject, isString } from "../../utils/internal/type-check";

export interface FileRef {
  key: string;
  storage?: string;
}

interface FileColumn {
  type: DataType;
}

interface KeyedNode {
  key?: unknown;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Takes the value of one file or image column of the row a module passes to the published collectFileRefs: a key, an image object, lists and objects of them, or any other leaf it skips.
type KeyExtractor = (value: unknown) => string[];

const IMAGE_TYPE_ID = "image";
const FILE_TYPE_ID = "file";

const collectImageKeys: KeyExtractor = (value) => {
  const keys: string[] = [];
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Visits that column value node by node, so a node is a key, an image object, a list or object of them, or any other leaf it skips.
  const visit = (node: unknown): void => {
    if (!node || !isObject(node)) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const { key: candidate }: KeyedNode = node;
    if (isString(candidate)) {
      keys.push(candidate);
      return;
    }
    Object.values(node).forEach(visit);
  };
  visit(value);
  return keys;
};

const collectFileKeys: KeyExtractor = (value) => {
  const keys: string[] = [];
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Visits that column value node by node, so a node is a key, an image object, a list or object of them, or any other leaf it skips.
  const visit = (node: unknown): void => {
    if (isString(node)) {
      keys.push(node);
      return;
    }
    if (!node || !isObject(node)) return;
    (Array.isArray(node) ? node : Object.values(node)).forEach(visit);
  };
  visit(value);
  return keys;
};

const KEY_EXTRACTORS = new Map<string, KeyExtractor>([
  [IMAGE_TYPE_ID, collectImageKeys],
  [FILE_TYPE_ID, collectFileKeys],
]);

function resolveStorage(type: DataType): string | undefined {
  const options = type.options;
  return isString(options?.storage) ? options.storage : undefined;
}

function refIdentity(ref: FileRef): string {
  return `${ref.storage ?? ""}:${ref.key}`;
}

export function hasFileColumns(columns: Record<string, FileColumn>): boolean {
  return Object.values(columns).some((column) => {
    const typeId = getDataTypeId(column.type);
    return typeId !== undefined && KEY_EXTRACTORS.has(typeId);
  });
}

export function collectFileRefs(
  columns: Record<string, FileColumn>,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published helper accepts application-defined rows; extractors inspect only file columns without parsing other fields.
  row: Record<string, unknown>,
): FileRef[] {
  const refs: FileRef[] = [];
  for (const [field, column] of Object.entries(columns)) {
    const typeId = getDataTypeId(column.type);
    const extractor = typeId ? KEY_EXTRACTORS.get(typeId) : undefined;
    if (!extractor) continue;
    const storage = resolveStorage(column.type);
    for (const key of extractor(
      Object.hasOwn(row, field) ? row[field] : undefined,
    )) {
      refs.push({ key, storage });
    }
  }
  return refs;
}

export function dedupeRefs(refs: FileRef[]): FileRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const identity = refIdentity(ref);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function diffRemovedRefs(
  before: FileRef[],
  after: FileRef[],
): FileRef[] {
  const retained = new Set(after.map(refIdentity));
  return dedupeRefs(before).filter((ref) => !retained.has(refIdentity(ref)));
}

type KeyMapper = (key: string) => Promise<string>;
type ScopedKeyMapper = (key: string, storage?: string) => Promise<string>;
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- Takes and answers the value of one file or image column of the row a module passes to the published remapRecordFileKeys, keeping every leaf it does not remap.
type ValueRemapper = (value: unknown, mapKey: KeyMapper) => Promise<unknown>;

async function remapEntries(
  source: ReadonlyArray<readonly [string, unknown]>,
  mapKey: KeyMapper,
  remap: ValueRemapper,
) {
  const entries = await Promise.all(
    source.map(
      async ([key, item]) => [key, await remap(item, mapKey)] as const,
    ),
  );
  return Object.fromEntries(entries);
}

const remapImageValue: ValueRemapper = async (value, mapKey) => {
  if (!value || !isObject(value)) return value;
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => remapImageValue(item, mapKey)));
  }
  const { key: candidate }: KeyedNode = value;
  if (isString(candidate)) {
    return { ...value, key: await mapKey(candidate) };
  }
  return remapEntries(Object.entries(value), mapKey, remapImageValue);
};

const remapFileValue: ValueRemapper = async (value, mapKey) => {
  if (isString(value)) return mapKey(value);
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => remapFileValue(item, mapKey)));
  }
  if (!value || !isObject(value)) return value;
  return remapEntries(Object.entries(value), mapKey, remapFileValue);
};

const VALUE_REMAPPERS = new Map<string, ValueRemapper>([
  [IMAGE_TYPE_ID, remapImageValue],
  [FILE_TYPE_ID, remapFileValue],
]);

export async function remapRecordFileKeys(
  columns: Record<string, FileColumn>,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published remapping contract preserves arbitrary application fields, not just file values.
  record: Record<string, unknown>,
  mapKey: ScopedKeyMapper,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published result preserves the caller's application-owned row contract.
): Promise<Record<string, unknown>> {
  const result = { ...record };
  for (const [field, column] of Object.entries(columns)) {
    const typeId = getDataTypeId(column.type);
    const remap = typeId ? VALUE_REMAPPERS.get(typeId) : undefined;
    if (!remap || !Object.hasOwn(record, field)) continue;
    const storage = resolveStorage(column.type);
    result[field] = await remap(record[field], (key) => mapKey(key, storage));
  }
  return result;
}
