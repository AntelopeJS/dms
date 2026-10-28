/** An entry as the site layout serves it: its category named by full id. */
export type WithCategoryRef<T> = Omit<T, "category"> & { categoryId?: string };

interface CategorizedEntry {
  /** The resolved category, as the registries hold it. */
  category?: unknown;
}

interface IdentifiedCategory {
  fullId: string;
}

function isIdentified(category: unknown): category is IdentifiedCategory {
  return (
    typeof category === "object" &&
    category !== null &&
    typeof (category as Partial<IdentifiedCategory>).fullId === "string"
  );
}

interface CategorizedTree extends CategorizedEntry {
  children: Record<string, CategorizedTree>;
}

/** A tree whose every node names its category by id. */
export type TreeWithCategoryRefs<T extends CategorizedTree> = WithCategoryRef<
  Omit<T, "children">
> & {
  children: Record<string, TreeWithCategoryRefs<T>>;
};

/** `entry` naming its category by full id. */
export function withCategoryRef<T extends CategorizedEntry>(
  entry: T,
): WithCategoryRef<T> {
  const { category, ...rest } = entry;
  return isIdentified(category)
    ? { ...rest, categoryId: category.fullId }
    : rest;
}

/** Every entry of `record` naming its category by full id. */
export function withCategoryRefs<T extends CategorizedEntry>(
  record: Record<string, T>,
): Record<string, WithCategoryRef<T>> {
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, withCategoryRef(entry)]),
  );
}

/** The tree, each node naming its category by full id, at every level. */
export function treeWithCategoryRefs<T extends CategorizedTree>(
  node: T,
): TreeWithCategoryRefs<T> {
  const { children, ...rest } = node;
  return {
    ...withCategoryRef(rest),
    children: Object.fromEntries(
      Object.entries(children).map(([key, child]) => [
        key,
        treeWithCategoryRefs(child as T),
      ]),
    ),
  } as TreeWithCategoryRefs<T>;
}
