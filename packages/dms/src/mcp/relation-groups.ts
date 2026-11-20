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

function groupBy(
  relations: readonly string[],
  keyOf: (relation: string) => string,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const relation of relations) {
    const key = keyOf(relation);
    groups.set(key, [...(groups.get(key) ?? []), relation]);
  }
  return groups;
}

/** The leading name segments every table shares, such as `["wp"]` for `wp_posts` and `wp_users`. */
function sharedSegments(names: readonly string[][]): string[] {
  const shared: string[] = [];
  for (let at = 0; ; at++) {
    const segment = names[0][at];
    const sharedByAll = names.every(
      (segments) => segments.length > at + 1 && segments[at] === segment,
    );
    if (!sharedByAll) return shared;
    shared.push(segment);
  }
}

function prefixGroups(relations: readonly string[]): RelationGroup[] {
  const segments = new Map(
    relations.map((relation) => [
      relation,
      splitRelation(relation).name.split(SEPARATOR),
    ]),
  );
  const shared = sharedSegments([...segments.values()]);
  const byPrefix = groupBy(relations, (relation) =>
    [...shared, segments.get(relation)?.[shared.length] ?? ""].join(SEPARATOR),
  );
  const grouped = [...byPrefix]
    .filter(([, members]) => members.length > 1)
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
 * else by the name prefix they share past the one common to all (`wp_shop_orders` and
 * `wp_shop_items` in `wp_shop`), the tables sharing none in a last group named `null`. `undefined` at
 * {@link GROUPING_THRESHOLD} tables or fewer, or when the tables fall into a single group.
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
