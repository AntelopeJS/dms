/** Past this many tables, the compact answer groups them so the user picks or skips a group at once. */
export const GROUPING_THRESHOLD = 30;

/** Tables of one schema, or of one name prefix when the database has a single schema. */
export interface RelationGroup {
  /** The schema or the name prefix; `null` for the tables that share no prefix. */
  name: string | null;
  by: "schema" | "prefix";
  /** `"schema.name"` of each table, sorted. */
  relations: string[];
}

const SEPARATOR = "_";

function splitRelation(relation: string) {
  const dot = relation.indexOf(".");
  return { schema: relation.slice(0, dot), name: relation.slice(dot + 1) };
}

/** A table name's segments, leading, doubled and trailing separators dropped. */
function segmentsOf(name: string): string[] {
  const segments = name.split(SEPARATOR).filter(Boolean);
  return segments.length > 0 ? segments : [name];
}

function groupBy(
  relations: readonly string[],
  keyOf: (relation: string) => string,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const relation of relations) {
    const key = keyOf(relation);
    const members = groups.get(key);
    if (members) members.push(relation);
    else groups.set(key, [relation]);
  }
  return groups;
}

function startsWith(segments: readonly string[], prefix: readonly string[]) {
  return prefix.every((segment, at) => segments[at] === segment);
}

/**
 * The leading segments more than half the tables share with a segment after them, such as
 * `["wp"]` for `wp_posts`, `wp_users` and a stray `migrations`.
 */
function sharedSegments(names: readonly string[][]): string[] {
  const shared: string[] = [];
  for (;;) {
    const counts = new Map<string, number>();
    for (const segments of names) {
      if (segments.length > shared.length + 1 && startsWith(segments, shared)) {
        const next = segments[shared.length];
        counts.set(next, (counts.get(next) ?? 0) + 1);
      }
    }
    const [top] = [...counts].sort(([, a], [, b]) => b - a);
    if (top === undefined || top[1] * 2 <= names.length) return shared;
    shared.push(top[0]);
  }
}

function prefixGroups(relations: readonly string[]): RelationGroup[] {
  const segments = new Map(
    relations.map((relation) => [
      relation,
      segmentsOf(splitRelation(relation).name),
    ]),
  );
  const shared = sharedSegments([...segments.values()]);
  const byPrefix = groupBy(relations, (relation) => {
    const own = segments.get(relation) ?? [];
    return startsWith(own, shared)
      ? own.slice(0, shared.length + 1).join(SEPARATOR)
      : own[0];
  });
  const grouped = [...byPrefix]
    .filter(([, members]) => members.length > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, members]): RelationGroup => ({
      name,
      by: "prefix",
      relations: members,
    }));
  const alone = [...byPrefix.values()].filter(
    (members) => members.length === 1,
  );
  if (alone.length === 0) return grouped;
  return [
    ...grouped,
    { name: null, by: "prefix", relations: alone.flat().sort() },
  ];
}

/**
 * The tables grouped for a user to pick or skip a group at once: by schema when they span several,
 * else by the name prefix they share past the one most tables share (`wp_shop_orders` and
 * `wp_shop_items` in `wp_shop`), the tables sharing none in a last group named `null`. `undefined`
 * at {@link GROUPING_THRESHOLD} tables or fewer, or when the tables fall into a single group.
 */
export function groupRelations(
  relations: readonly string[],
): RelationGroup[] | undefined {
  if (relations.length <= GROUPING_THRESHOLD) return undefined;
  const sorted = [...relations].sort();
  const bySchema = groupBy(
    sorted,
    (relation) => splitRelation(relation).schema,
  );
  const groups =
    bySchema.size > 1
      ? [...bySchema].map(([name, members]): RelationGroup => ({
          name,
          by: "schema",
          relations: members,
        }))
      : prefixGroups(sorted);
  return groups.length > 1 ? groups : undefined;
}
