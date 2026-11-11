import { humanized, singular } from "./name-words";

/** Tables a framework or a migration tool keeps, which hold nothing an integrator lists (R4). */
const TECHNICAL_TABLES: readonly RegExp[] = [
  /_migrations$/,
  /^schema_migrations$/,
  /^knex_/,
  /^django_/,
  /^flyway_/,
  /^_/,
];

/** Columns named like a secret, which no page shows (F2). */
const SECRET_COLUMNS: readonly RegExp[] = [
  /^password$/,
  /^passwd$/,
  /^pwd$/,
  /_hash$/,
  /^salt$/,
  /^token$/,
  /^secret$/,
  /^api_key$/,
];

/** Columns that name a row for a person: a person's or a thing's name, a title. */
const HUMAN_LABELS: readonly string[] = [
  "name",
  "full_name",
  "fullname",
  "display_name",
  "displayname",
  "title",
  "label",
];

/** Label candidates by name, the first found winning (L1): what a person reads before a code. */
const PREFERRED_LABELS: readonly string[] = [
  ...HUMAN_LABELS,
  "code",
  "reference",
];

/** `<target>_id`, `<target>_ref`, `<target>_code` and `<target>id`, for F5. */
const IMPLIED_REFERENCE = /^(.+?)(?:_id|_ref|_code|id)$/;

/** A camelCase boundary, as a document field spells `orderRef`: read as `order_ref`. */
const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g;

/** A comment's first sentence titles a page or a column when it is at most this long (L2). */
const TITLE_LENGTH = 40;
const SENTENCE_END = /[.\n]/;

export function isTechnicalTable(name: string): boolean {
  return TECHNICAL_TABLES.some((pattern) => pattern.test(name.toLowerCase()));
}

/**
 * Whether a text column is named like a human name. Such a column labels a row though its values
 * repeat (two customers can share a name), which the profile's near-unique test would refuse.
 */
export function isHumanLabelName(name: string): boolean {
  return HUMAN_LABELS.includes(name.toLowerCase());
}

export function isSecretColumn(name: string): boolean {
  return SECRET_COLUMNS.some((pattern) => pattern.test(name.toLowerCase()));
}

/** The preferred label among candidates, and whether the choice was a tie broken by order. */
export interface LabelChoice {
  column: string;
  tied: boolean;
}

export function preferredLabel(candidates: string[]): LabelChoice | undefined {
  for (const preferred of PREFERRED_LABELS) {
    const found = candidates.find(
      (candidate) => candidate.toLowerCase() === preferred,
    );
    if (found) {
      return { column: found, tied: false };
    }
  }
  if (candidates.length === 0) {
    return undefined;
  }
  return { column: candidates[0], tied: candidates.length > 1 };
}

/**
 * The relation names a column named like a reference may point at: `customer_id` → customers,
 * and the camelCase spellings of document databases alike, `orderRef` → orders.
 */
export function impliedTargetNames(column: string): string[] {
  const snake = column.replace(CAMEL_BOUNDARY, "$1_$2").toLowerCase();
  const match = IMPLIED_REFERENCE.exec(snake);
  if (!match || match[1].length === 0) {
    return [];
  }
  const stem = match[1].replace(/_$/, "");
  const plurals = [stem, `${stem}s`, `${stem}es`];
  if (stem.endsWith("y")) {
    plurals.push(`${stem.slice(0, -1)}ies`);
  }
  return plurals;
}

/** A title from a comment's first sentence when it is short, otherwise from the name (L2). */
export function titleOf(comment: string | null, name: string): string {
  const sentence = comment?.split(SENTENCE_END)[0]?.trim();
  if (sentence && sentence.length <= TITLE_LENGTH) {
    return sentence;
  }
  return humanized(name);
}

/**
 * The title of a column pointing at a relation: the relation's title in singular (D3), unless the
 * database commented the column with a short first sentence, which outranks it (L2).
 */
export function relationColumnTitle(
  comment: string | null,
  name: string,
  targetTitle: string,
): { value: string; rule: "D3" | "L2" } {
  const title = titleOf(comment, name);
  return title === humanized(name)
    ? { value: singular(targetTitle), rule: "D3" }
    : { value: title, rule: "L2" };
}
