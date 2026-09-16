import { type DataType, getDataTypeId } from "../data-types";

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

interface StorageOptions {
  storage?: unknown;
}

type KeyExtractor = (value: unknown) => string[];

const IMAGE_TYPE_ID = "image";
const FILE_TYPE_ID = "file";

const collectImageKeys: KeyExtractor = (value) => {
  const keys: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const candidate = (node as KeyedNode).key;
    if (typeof candidate === "string") {
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
  const visit = (node: unknown): void => {
    if (typeof node === "string") {
      keys.push(node);
      return;
    }
    if (!node || typeof node !== "object") return;
    (Array.isArray(node) ? node : Object.values(node)).forEach(visit);
  };
  visit(value);
  return keys;
};

const KEY_EXTRACTORS: Record<string, KeyExtractor> = {
  [IMAGE_TYPE_ID]: collectImageKeys,
  [FILE_TYPE_ID]: collectFileKeys,
};

function resolveStorage(type: DataType): string | undefined {
  const options = type.options as StorageOptions | undefined;
  return typeof options?.storage === "string" ? options.storage : undefined;
}

function refIdentity(ref: FileRef): string {
  return `${ref.storage ?? ""}:${ref.key}`;
}

export function hasFileColumns(columns: Record<string, FileColumn>): boolean {
  return Object.values(columns).some((column) => {
    const typeId = getDataTypeId(column.type);
    return typeId !== undefined && typeId in KEY_EXTRACTORS;
  });
}

export function collectFileRefs(
  columns: Record<string, FileColumn>,
  row: Record<string, unknown>,
): FileRef[] {
  const refs: FileRef[] = [];
  for (const [field, column] of Object.entries(columns)) {
    const typeId = getDataTypeId(column.type);
    const extractor = typeId ? KEY_EXTRACTORS[typeId] : undefined;
    if (!extractor) continue;
    const storage = resolveStorage(column.type);
    for (const key of extractor(row[field])) {
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
type ValueRemapper = (value: unknown, mapKey: KeyMapper) => Promise<unknown>;

async function remapObjectValues(
  // `object` is the contract: this walks whatever it is given with
  // Object.entries and remaps the values.
  // oxlint-disable-next-line anti-slop/no-object-parameters
  value: object,
  mapKey: KeyMapper,
  remap: ValueRemapper,
): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    Object.entries(value).map(
      async ([key, item]) => [key, await remap(item, mapKey)] as const,
    ),
  );
  return Object.fromEntries(entries);
}

const remapImageValue: ValueRemapper = async (value, mapKey) => {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => remapImageValue(item, mapKey)));
  }
  const candidate = (value as KeyedNode).key;
  if (typeof candidate === "string") {
    return { ...value, key: await mapKey(candidate) };
  }
  return remapObjectValues(value, mapKey, remapImageValue);
};

const remapFileValue: ValueRemapper = async (value, mapKey) => {
  if (typeof value === "string") return mapKey(value);
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => remapFileValue(item, mapKey)));
  }
  if (!value || typeof value !== "object") return value;
  return remapObjectValues(value, mapKey, remapFileValue);
};

const VALUE_REMAPPERS: Record<string, ValueRemapper> = {
  [IMAGE_TYPE_ID]: remapImageValue,
  [FILE_TYPE_ID]: remapFileValue,
};

export async function remapRecordFileKeys(
  columns: Record<string, FileColumn>,
  record: Record<string, unknown>,
  mapKey: ScopedKeyMapper,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = { ...record };
  for (const [field, column] of Object.entries(columns)) {
    const typeId = getDataTypeId(column.type);
    const remap = typeId ? VALUE_REMAPPERS[typeId] : undefined;
    if (!remap || !(field in record)) continue;
    const storage = resolveStorage(column.type);
    result[field] = await remap(record[field], (key) => mapKey(key, storage));
  }
  return result;
}
