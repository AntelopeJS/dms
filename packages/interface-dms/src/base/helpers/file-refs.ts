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

type KeyExtractor = (
  value: Parameters<typeof collectFileRefs>[1][string],
) => string[];

const IMAGE_TYPE_ID = "image";
const FILE_TYPE_ID = "file";

const collectImageKeys: KeyExtractor = (value) => {
  const keys: string[] = [];
  const visit = (node: Parameters<KeyExtractor>[0]): void => {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- This is the field-value inspection boundary; parsing objects would reject previously ignored leaves.
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const { key: candidate }: KeyedNode = node;
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only string keys identify stored files; the enclosing object otherwise remains arbitrary application data.
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
  const visit = (node: Parameters<KeyExtractor>[0]): void => {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- String leaves identify file keys in this legacy field representation.
    if (typeof node === "string") {
      keys.push(node);
      return;
    }
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Ignore unsupported leaves without changing accepted application field values.
    if (!node || typeof node !== "object") return;
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
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The published open options contract permits non-string storage values, which this helper ignores.
  return typeof options?.storage === "string" ? options.storage : undefined;
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
type ValueRemapper = (
  value: Parameters<typeof remapRecordFileKeys>[1][string],
  mapKey: KeyMapper,
) => Promise<Parameters<typeof remapRecordFileKeys>[1][string]>;

async function remapObjectValues(
  // oxlint-disable-next-line anti-slop/no-object-parameters -- Object.entries walks arbitrary object values and remaps them without requiring a dictionary index signature.
  value: object,
  mapKey: KeyMapper,
  remap: ValueRemapper,
): Promise<Parameters<typeof remapRecordFileKeys>[1]> {
  const entries = await Promise.all(
    Object.entries(value).map(
      async ([key, item]) => [key, await remap(item, mapKey)] as const,
    ),
  );
  return Object.fromEntries(entries);
}

const remapImageValue: ValueRemapper = async (value, mapKey) => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Preserve unsupported application leaves instead of validating the whole image field.
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => remapImageValue(item, mapKey)));
  }
  const { key: candidate }: KeyedNode = value;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only string keys are remapped; all other object members retain their existing traversal behavior.
  if (typeof candidate === "string") {
    return { ...value, key: await mapKey(candidate) };
  }
  return remapObjectValues(value, mapKey, remapImageValue);
};

const remapFileValue: ValueRemapper = async (value, mapKey) => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- String leaves are file keys in this field representation; other application leaves pass through.
  if (typeof value === "string") return mapKey(value);
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => remapFileValue(item, mapKey)));
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Preserve unsupported application leaves without introducing validation or coercion.
  if (!value || typeof value !== "object") return value;
  return remapObjectValues(value, mapKey, remapFileValue);
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
