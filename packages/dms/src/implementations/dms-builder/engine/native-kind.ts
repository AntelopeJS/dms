const NATIVE_KINDS: [RegExp, string][] = [
  [
    /^(smallint|integer|int|bigint|int[248]|(small|big)?serial|serial[248]|numeric|decimal|real|double precision|float[48])$/,
    "number",
  ],
  [
    /^(text|character varying|varchar|character|char|bpchar|citext|name)$/,
    "text",
  ],
];

/**
 * The kinds of a document source's sampled types, by the names the MongoDB and RethinkDB catalogs
 * write: an ObjectId or a uuid is addressed by its text, so it compares with text.
 */
const DOCUMENT_KINDS = new Map<string, string>([
  ["string", "text"],
  ["STRING", "text"],
  ["objectId", "text"],
  ["uuid", "text"],
  ["int", "number"],
  ["long", "number"],
  ["double", "number"],
  ["decimal", "number"],
  ["NUMBER", "number"],
]);

/** A document source's `native`: sampled types with their shares, the dominant first. */
const SAMPLED_SHARE = /^(\S+) \d+%/;

/**
 * The kind of value a native type holds, so two columns compare: numbers with numbers, text with
 * text, any other type only with itself. Modifiers such as a length are left out. A document
 * source's column holds the kind of its dominant sampled type.
 */
export function nativeKind(native: string): string {
  const sampled = SAMPLED_SHARE.exec(native)?.[1];
  if (sampled !== undefined) {
    return DOCUMENT_KINDS.get(sampled) ?? sampled;
  }
  const base = native
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .trim();
  return NATIVE_KINDS.find(([pattern]) => pattern.test(base))?.[1] ?? base;
}
