export interface CascaderKeyMapping {
  label: string;
  value: string;
  parent: string;
  disabled?: string;
}

export interface CascaderNode {
  label: string;
  value: string;
  disabled: boolean;
  depth: number;
  pathLabels: string[];
  pathValues: string[];
  children: CascaderNode[];
  raw: Record<string, unknown>;
}

export interface CascaderSelectionRules {
  leafOnly?: boolean;
  maxDepth?: number;
}

export interface CascaderTreeOptions {
  maxDepth?: number;
}

export const CASCADER_PATH_SEPARATOR = " / ";

export const CASCADER_FETCH_LIMIT = 1000;

export const DEFAULT_CASCADER_KEY_MAPPING: CascaderKeyMapping = {
  label: "label",
  value: "value",
  parent: "parent",
};

export function resolveCascaderKeyMapping(
  mapping?: Partial<CascaderKeyMapping>,
): CascaderKeyMapping {
  return { ...DEFAULT_CASCADER_KEY_MAPPING, ...mapping };
}

type CascaderRow = Record<string, unknown>;

function rowValue(row: CascaderRow, key: string): string | undefined {
  const value = row[key];
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

function createNode(
  row: CascaderRow,
  keyMapping: CascaderKeyMapping,
  parent: CascaderNode | undefined,
): CascaderNode {
  const value = rowValue(row, keyMapping.value) ?? "";
  const label = rowValue(row, keyMapping.label) ?? value;
  const ownDisabled = keyMapping.disabled
    ? Boolean(row[keyMapping.disabled])
    : false;

  return {
    label,
    value,
    disabled: ownDisabled || (parent?.disabled ?? false),
    depth: (parent?.depth ?? 0) + 1,
    pathLabels: [...(parent?.pathLabels ?? []), label],
    pathValues: [...(parent?.pathValues ?? []), value],
    children: [],
    raw: row,
  };
}

/**
 * Rebuilds a tree from a flat list of rows holding a self-reference
 * (`parent` field of the key mapping).
 *
 * - Rows without a parent, or whose parent is absent from the list, become
 *   roots (orphans are kept visible rather than dropped).
 * - A disabled row disables its entire subtree.
 * - Nodes deeper than `maxDepth` are pruned (a node at `maxDepth` is a leaf).
 * - Rows trapped in a parent cycle are unreachable from any root and are
 *   dropped.
 */
export function buildCascaderTree(
  rows: CascaderRow[],
  keyMapping: CascaderKeyMapping,
  options: CascaderTreeOptions = {},
): CascaderNode[] {
  const knownValues = new Set(
    rows
      .map((row) => rowValue(row, keyMapping.value))
      .filter((value): value is string => value !== undefined),
  );

  const childRowsByParent = new Map<string, CascaderRow[]>();
  const rootRows: CascaderRow[] = [];
  for (const row of rows) {
    if (rowValue(row, keyMapping.value) === undefined) continue;
    const parent = rowValue(row, keyMapping.parent);
    if (parent === undefined || !knownValues.has(parent)) {
      rootRows.push(row);
      continue;
    }
    childRowsByParent.set(parent, [
      ...(childRowsByParent.get(parent) ?? []),
      row,
    ]);
  }

  const visited = new Set<string>();
  const attachChildren = (node: CascaderNode): CascaderNode => {
    if (options.maxDepth && node.depth >= options.maxDepth) return node;
    node.children = (childRowsByParent.get(node.value) ?? [])
      .filter((row) => !visited.has(rowValue(row, keyMapping.value) ?? ""))
      .map((row) => {
        const child = createNode(row, keyMapping, node);
        visited.add(child.value);
        return attachChildren(child);
      });
    return node;
  };

  return rootRows.map((row) => {
    const root = createNode(row, keyMapping, undefined);
    visited.add(root.value);
    return attachChildren(root);
  });
}

export function flattenCascaderTree(roots: CascaderNode[]): CascaderNode[] {
  return roots.flatMap((node) => [node, ...flattenCascaderTree(node.children)]);
}

export function formatCascaderPath(node: CascaderNode): string {
  return node.pathLabels.join(CASCADER_PATH_SEPARATOR);
}

/**
 * Returns the nodes whose full path (e.g. `Electronics / Audio / Headphones`)
 * contains the query, case-insensitively. Disabled nodes are included so the
 * UI can show them greyed out.
 */
export function searchCascaderTree(
  roots: CascaderNode[],
  query: string,
): CascaderNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return flattenCascaderTree(roots).filter((node) =>
    formatCascaderPath(node).toLowerCase().includes(needle),
  );
}

export function isCascaderNodeSelectable(
  node: CascaderNode,
  rules: CascaderSelectionRules = {},
): boolean {
  if (node.disabled) return false;
  if (rules.leafOnly && node.children.length > 0) return false;
  if (rules.maxDepth && node.depth > rules.maxDepth) return false;
  return true;
}

export function findCascaderNode(
  roots: CascaderNode[],
  value: string,
): CascaderNode | undefined {
  for (const node of roots) {
    if (node.value === value) return node;
    const found = findCascaderNode(node.children, value);
    if (found) return found;
  }
  return undefined;
}

/**
 * Resolves the root-to-node label path of `value` by walking the `parent`
 * references of the flat list, without building the whole tree. Returns an
 * empty array when the value is absent; stops at missing parents or cycles.
 */
export function buildCascaderPathLabels(
  rows: CascaderRow[],
  keyMapping: CascaderKeyMapping,
  value: string,
): string[] {
  const rowsByValue = new Map(
    rows.map((row) => [rowValue(row, keyMapping.value), row]),
  );

  const labels: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = value;
  while (current !== undefined && !visited.has(current)) {
    visited.add(current);
    const row = rowsByValue.get(current);
    if (!row) break;
    labels.unshift(rowValue(row, keyMapping.label) ?? current);
    current = rowValue(row, keyMapping.parent);
  }
  return labels;
}
