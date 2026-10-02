import type { Stream, Table, ValueProxy } from "@antelopejs/interface-database";
import type { TreeNode } from "./tree";
import {
  byFields,
  byKey,
  DAY_SHIFT,
  groupText,
  isKey,
  type Key,
  type KeyCount,
  MONTH_SHIFT,
  PRIMARY_KEY,
  QUARTER_SHIFT,
  type Row,
  rowText,
} from "./tree-source-text";

export type TreePeriod = "day" | "month" | "quarter" | "year";

// oxlint-disable-next-line typescript/no-explicit-any
export type TreeTable = Table<any>;

export interface TreeLevel {
  table: TreeTable;
  by?: string;
  every?: TreePeriod;
  label?: string[];
  parent?: string;
  link?: string;
  icon?: string;
}

export interface TreeSource {
  levels: TreeLevel[];
  lazy?: boolean;
}

export interface TreeRequest {
  url?: string;
  branch?: string;
}

export const TREE_BRANCH_PARAMETER = "branch";

interface Item {
  level: number;
  key: Key;
  label: string;
  scope: Key[];
  children?: Item[];
  more?: boolean;
}

const PERIOD_FIELD = "period";

const NO_VALUE_KEY = "∅";

const QUARTER_MONTHS = 3;

const isGroupLevel = (level: TreeLevel): boolean => level.by !== undefined;

function checkLevels(levels: TreeLevel[]): void {
  if (levels.length === 0) {
    throw new Error("A tree read from tables needs at least one level.");
  }
  const firstRows = levels.findIndex((level) => !isGroupLevel(level));
  levels.forEach((level, at) => {
    if (isGroupLevel(level)) {
      if (firstRows !== -1 && at > firstRows) {
        throw new Error(
          `Tree level ${at + 1} groups rows after a level listing them: grouping levels come first.`,
        );
      }
      return;
    }
    if (at > firstRows && !level.link) {
      throw new Error(
        `Tree level ${at + 1} lists rows under a row: it needs the field linking them, \`link\`.`,
      );
    }
  });
}

function periodOf(
  date: ValueProxy<Date>,
  every: TreePeriod,
): ValueProxy<number> {
  const year = date.year();
  if (every === "year") {
    return year;
  }
  if (every === "quarter") {
    return year
      .mul(QUARTER_SHIFT)
      .add(date.month().sub(1).div(QUARTER_MONTHS).floor().add(1));
  }
  const month = year.mul(MONTH_SHIFT).add(date.month());
  return every === "month" ? month : month.mul(DAY_SHIFT).add(date.day());
}

function periodKeyOf(
  row: ValueProxy<Row>,
  field: string,
  every: TreePeriod,
): ValueProxy<number> {
  return periodOf(row.key<Record<string, Date>, string>(field), every);
}

const EARLIEST_DATE = new Date(-8.64e15);

function holdsDate(row: ValueProxy<Row>, field: string): ValueProxy<boolean> {
  return row.key(field).ge(EARLIEST_DATE);
}

function inGroup(
  row: ValueProxy<Row>,
  level: TreeLevel,
  key: Key,
): ValueProxy<boolean> {
  const field = level.by as string;
  if (!level.every) {
    return row.key(field).default(null).eq(key);
  }
  return key === null
    ? holdsDate(row, field).not()
    : holdsDate(row, field).and(periodKeyOf(row, field, level.every).eq(key));
}

function inScope(
  row: ValueProxy<Row>,
  levels: TreeLevel[],
  scope: Key[],
): ValueProxy<boolean> {
  return scope
    .map((key, at) => inGroup(row, levels[at] as TreeLevel, key))
    .reduce((all, one) => all.and(one));
}

function scoped(
  rows: Stream<Row>,
  levels: TreeLevel[],
  scope: Key[],
): Stream<Row> {
  return scope.length === 0
    ? rows
    : rows.filter((row) => inScope(row, levels, scope));
}

function atTop(row: ValueProxy<Row>, parent: string): ValueProxy<boolean> {
  const value = row.key(parent);
  return value.default(null).eq(null).or(value.eq(""));
}

function rowFields(level: TreeLevel): string[] {
  return [
    ...new Set(
      [PRIMARY_KEY, ...(level.label ?? []), level.parent, level.link].filter(
        (field): field is string => field !== undefined,
      ),
    ),
  ];
}

async function periodGroups(
  rows: Stream<Row>,
  field: string,
  every: TreePeriod,
): Promise<KeyCount[]> {
  const [dated, undated] = await Promise.all([
    rows
      .filter((row) => holdsDate(row, field))
      .map((row) => ({ [PERIOD_FIELD]: periodKeyOf(row, field, every) }))
      .group(PERIOD_FIELD, (members, key) => ({ key, count: members.count() })),
    rows.filter((row) => holdsDate(row, field).not()).count(),
  ]);
  const groups = dated as KeyCount[];
  return undated > 0 ? [...groups, { key: null, count: undated }] : groups;
}

async function groupItems(
  levels: TreeLevel[],
  at: number,
  scope: Key[],
): Promise<Item[]> {
  const level = levels[at] as TreeLevel;
  const rows = scoped(level.table as Stream<Row>, levels, scope);
  const by = level.by as string;
  const every = level.every;
  const groups = (
    every
      ? await periodGroups(rows, by, every)
      : await rows.group(by, (members, key) => ({
          key,
          count: members.count(),
        }))
  ) as KeyCount[];
  return groups
    .sort((a, b) => byKey(a.key, b.key))
    .map((group) => ({
      level: at,
      key: group.key,
      label: `${groupText(group.key, level.every)} (${group.count})`,
      scope,
    }));
}

function rowItems(
  level: TreeLevel,
  at: number,
  rows: Row[],
  scope: Key[],
): Item[] {
  return rows
    .map((row): [Row, Item] => [
      row,
      {
        level: at,
        key: row[PRIMARY_KEY] as Key,
        label: rowText(row, level),
        scope,
      },
    ])
    .sort(byFields(level))
    .map(([, item]) => item);
}

async function topRows(
  levels: TreeLevel[],
  at: number,
  scope: Key[],
): Promise<Item[]> {
  const level = levels[at] as TreeLevel;
  let rows = scoped(level.table as Stream<Row>, levels, scope);
  if (level.parent) {
    const parent = level.parent;
    rows = rows.filter((row) => atTop(row, parent));
  }
  const found = (await rows.pluck(...rowFields(level))) as Row[];
  return rowItems(level, at, found, scope);
}

function levelItems(
  levels: TreeLevel[],
  at: number,
  scope: Key[],
): Promise<Item[]> {
  return isGroupLevel(levels[at] as TreeLevel)
    ? groupItems(levels, at, scope)
    : topRows(levels, at, scope);
}

async function rowsNaming(
  level: TreeLevel,
  field: string,
  keys: Key[],
  filter?: (row: ValueProxy<Row>) => ValueProxy<boolean>,
): Promise<Map<Key, Row[]>> {
  let rows: Stream<Row> = level.table.getAll(
    keys as Array<string | number | boolean>,
    field,
  ) as Stream<Row>;
  if (filter) {
    rows = rows.filter(filter);
  }
  const found = (await rows.pluck(...rowFields(level))) as Row[];
  const byKey = new Map<Key, Row[]>();
  for (const row of found) {
    const named = row[field] as Key;
    byKey.set(named, [...(byKey.get(named) ?? []), row]);
  }
  return byKey;
}

function batches(items: Item[]): Item[][] {
  const byShape = new Map<string, Item[]>();
  for (const item of items) {
    const shape = JSON.stringify([item.level, item.scope]);
    byShape.set(shape, [...(byShape.get(shape) ?? []), item]);
  }
  return [...byShape.values()];
}

async function rowChildren(
  levels: TreeLevel[],
  batch: Item[],
  children: Map<Item, Item[]>,
): Promise<void> {
  const { level: at, scope } = batch[0] as Item;
  const level = levels[at] as TreeLevel;
  const next = levels[at + 1];
  const keys = batch.map((item) => item.key);
  const nested = level.parent
    ? await rowsNaming(
        level,
        level.parent,
        keys,
        scope.length > 0 ? (row) => inScope(row, levels, scope) : undefined,
      )
    : undefined;
  const nextParent = next?.parent;
  const linked = next?.link
    ? await rowsNaming(
        next,
        next.link,
        keys,
        nextParent ? (row) => atTop(row, nextParent) : undefined,
      )
    : undefined;
  for (const item of batch) {
    children.set(item, [
      ...rowItems(level, at, nested?.get(item.key) ?? [], scope),
      ...(next ? rowItems(next, at + 1, linked?.get(item.key) ?? [], []) : []),
    ]);
  }
}

async function childrenOf(
  levels: TreeLevel[],
  items: Item[],
): Promise<Map<Item, Item[]>> {
  const children = new Map<Item, Item[]>();
  const groups = items.filter((item) =>
    isGroupLevel(levels[item.level] as TreeLevel),
  );
  await Promise.all(
    groups.map(async (item) => {
      const below = item.level + 1;
      children.set(
        item,
        below < levels.length
          ? await levelItems(levels, below, [...item.scope, item.key])
          : [],
      );
    }),
  );
  const rows = items.filter(
    (item) => !isGroupLevel(levels[item.level] as TreeLevel),
  );
  await Promise.all(
    batches(rows).map((batch) => rowChildren(levels, batch, children)),
  );
  return children;
}

async function grow(levels: TreeLevel[], items: Item[]): Promise<void> {
  let frontier = items;
  while (frontier.length > 0) {
    const children = await childrenOf(levels, frontier);
    const next: Item[] = [];
    for (const item of frontier) {
      const below = children.get(item) ?? [];
      if (below.length > 0) {
        item.children = below;
        next.push(...below);
      }
    }
    frontier = next;
  }
}

async function keysNamed(
  level: TreeLevel,
  field: string,
  keys: Key[],
  filter?: (row: ValueProxy<Row>) => ValueProxy<boolean>,
): Promise<Set<Key>> {
  let rows: Stream<Row> = level.table.getAll(
    keys as Array<string | number | boolean>,
    field,
  ) as Stream<Row>;
  if (filter) {
    rows = rows.filter(filter);
  }
  return new Set((await rows.distinct(field)) as Key[]);
}

async function markBranches(levels: TreeLevel[], items: Item[]): Promise<void> {
  for (const item of items) {
    if (isGroupLevel(levels[item.level] as TreeLevel)) {
      item.more = item.level + 1 < levels.length;
    }
  }
  const rows = items.filter(
    (item) => !isGroupLevel(levels[item.level] as TreeLevel),
  );
  await Promise.all(
    batches(rows).map(async (batch) => {
      const { level: at, scope } = batch[0] as Item;
      const level = levels[at] as TreeLevel;
      const next = levels[at + 1];
      const keys = batch.map((item) => item.key);
      const [nesting, linking] = await Promise.all([
        level.parent
          ? keysNamed(
              level,
              level.parent,
              keys,
              scope.length > 0
                ? (row) => inScope(row, levels, scope)
                : undefined,
            )
          : new Set<Key>(),
        next?.link ? keysNamed(next, next.link, keys) : new Set<Key>(),
      ]);
      for (const item of batch) {
        item.more = nesting.has(item.key) || linking.has(item.key);
      }
    }),
  );
}

function branchOf(item: Item): string {
  return JSON.stringify([item.level, item.key, ...item.scope]);
}

function itemOfBranch(levels: TreeLevel[], branch: string): Item | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(branch);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed) || parsed.length < 2) {
    return undefined;
  }
  const [level, key, ...scope] = parsed as unknown[];
  if (
    typeof level !== "number" ||
    !Number.isInteger(level) ||
    level < 0 ||
    level >= levels.length ||
    !isKey(key) ||
    !scope.every(isKey) ||
    scope.length > level ||
    scope.some((_, at) => !isGroupLevel(levels[at] as TreeLevel))
  ) {
    return undefined;
  }
  return { level, key, label: "", scope: scope as Key[] };
}

function branchUrl(url: string, item: Item): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${TREE_BRANCH_PARAMETER}=${encodeURIComponent(branchOf(item))}`;
}

function nodeOf(
  item: Item,
  levels: TreeLevel[],
  url: string,
  lazy: boolean,
): TreeNode {
  const node: TreeNode = {
    label: item.label,
    value:
      item.key === null || item.key === "" ? NO_VALUE_KEY : String(item.key),
  };
  const icon = levels[item.level]?.icon;
  if (icon) {
    node.icon = icon;
  }
  if (item.children && item.children.length > 0) {
    node.children = item.children.map((child) =>
      nodeOf(child, levels, url, lazy),
    );
  } else if (lazy && item.more) {
    node.hasChildren = true;
    node.lazyLoadUrl = branchUrl(url, item);
  }
  return node;
}

export async function treeNodes(
  source: TreeSource,
  request: TreeRequest = {},
): Promise<TreeNode[]> {
  const { levels } = source;
  checkLevels(levels);
  const lazy = source.lazy === true;
  if (lazy && !request.url) {
    throw new Error(
      "A tree read lazily needs the address it is read at, `url`, to say where each branch is.",
    );
  }
  let items: Item[];
  if (request.branch) {
    const item = lazy ? itemOfBranch(levels, request.branch) : undefined;
    if (!item) {
      return [];
    }
    items = (await childrenOf(levels, [item])).get(item) ?? [];
  } else {
    items = await levelItems(levels, 0, []);
  }
  await (lazy ? markBranches(levels, items) : grow(levels, items));
  return items.map((item) => nodeOf(item, levels, request.url ?? "", lazy));
}
