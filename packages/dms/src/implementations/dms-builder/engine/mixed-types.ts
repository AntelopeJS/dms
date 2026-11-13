import type { ColumnDescription } from "@antelopejs/interface-database-catalog";

/**
 * The declaration each native type of a document source reads as, by the names the MongoDB and
 * RethinkDB providers write in `native`: their `$type` and `typeOf` names.
 */
const READINGS = new Map<string, string>([
  ["objectId", "string"],
  ["uuid", "string"],
  ["string", "string"],
  ["STRING", "string"],
  ["int", "number"],
  ["long", "number"],
  ["double", "number"],
  ["decimal", "number"],
  ["NUMBER", "number"],
  ["date", "date"],
  ["PTYPE<TIME>", "date"],
  ["bool", "boolean"],
  ["BOOL", "boolean"],
]);

const SHARE_SEPARATOR = " | ";
const SHARE = /^(\S+) \d+%/;

/**
 * The declarations a column may take when its values have several native types and none covers
 * enough of them for the provider to propose one: a declaration per type it reads, in the order
 * of their shares. Empty for a column the provider proposes a declaration for, and for one of a
 * single type.
 */
export function MixedTypeDeclarations(column: ColumnDescription): string[] {
  const shares = column.native.split(SHARE_SEPARATOR);
  if (column.accepts.length > 0 || shares.length < 2) {
    return [];
  }
  const declarations = shares.flatMap((share) => {
    const declared = READINGS.get(SHARE.exec(share)?.[1] ?? "");
    return declared ? [declared] : [];
  });
  return [...new Set(declarations)];
}
