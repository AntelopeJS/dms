import type { RolePermissionNode } from "./role-types";

/** Lookups over the permission tree the editor needs on every toggle. */
export interface PermissionIndex {
  nodes: Map<string, RolePermissionNode>;
  parents: Map<string, string>;
  /** Every id of a node's subtree, the node included. */
  subtrees: Map<string, string[]>;
  allIds: string[];
}

/** A top-level block of the tree, collapsible, with its own count. */
export interface PermissionArea {
  node: RolePermissionNode;
  /**
   * The top-level permission the area sits under (`pages`, `settings`…),
   * itself grantable: the tree shows it as a heading above its areas.
   */
  sectionNode?: RolePermissionNode;
  /** Label of the section the area belongs to, when it has one. */
  section?: string;
}

/** A search hit, under the path that locates it. */
export interface PermissionSearchHit {
  heading: string;
  node: RolePermissionNode;
  areaId: string;
}

/** What a grant changed: the new selection and what it added on its own. */
export interface PermissionGrant {
  selection: Set<string>;
  autoAdded: string[];
}

/** How a permission differs from the saved role. */
export type PermissionChange = "added" | "removed" | null;

/**
 * What every row of the nested tree reads its state from and reports its
 * clicks to, handed down the branches as one object.
 */
export interface PermissionRowContext {
  index: PermissionIndex;
  selection: Set<string>;
  /** Ids of the open collapsible rows. */
  expanded: Set<string>;
  stateOf: (node: RolePermissionNode) => SelectionState;
  changeOf: (id: string) => PermissionChange;
  requiresOf: (node: RolePermissionNode) => string[];
  autoAddedHintOf: (id: string) => string | undefined;
  /** Warnings a closed row hides (see `selectedWarningsBelow`). */
  warningsBelowOf: (node: RolePermissionNode) => string[];
  isDisabled: (node: RolePermissionNode) => boolean;
  disabledHint: string;
  toggle: (id: string, checked: boolean) => void;
  toggleExpanded: (id: string) => void;
}

/** Id of the element listing a collapsible row's children (`aria-controls`). */
export function childrenElementId(id: string): string {
  return `role-permission-children-${id}`;
}

/** State of a checkbox standing for a set of permissions. */
export type SelectionState = boolean | "indeterminate";

/** Permissions of a subtree that are selected, out of how many. */
export interface SelectionCount {
  selected: number;
  total: number;
}

const PATH_SEPARATOR = " › ";

function indexNode(
  index: PermissionIndex,
  node: RolePermissionNode,
  parentId?: string,
): string[] {
  index.nodes.set(node.id, node);
  if (parentId) index.parents.set(node.id, parentId);
  const subtree = [
    node.id,
    ...(node.children ?? []).flatMap((child) =>
      indexNode(index, child, node.id),
    ),
  ];
  index.subtrees.set(node.id, subtree);
  return subtree;
}

/** Index a permission tree for the toggles, counts and searches. */
export function buildPermissionIndex(
  tree: RolePermissionNode[],
): PermissionIndex {
  const index: PermissionIndex = {
    nodes: new Map(),
    parents: new Map(),
    subtrees: new Map(),
    allIds: [],
  };
  index.allIds = tree.flatMap((node) => indexNode(index, node));
  return index;
}

/** Ids of a node's ancestors, closest first. */
export function ancestorIds(index: PermissionIndex, id: string): string[] {
  const ancestors: string[] = [];
  let current = index.parents.get(id);
  while (current) {
    ancestors.push(current);
    current = index.parents.get(current);
  }
  return ancestors;
}

/** Whether a node has children: a collapsible row rather than a leaf. */
export function hasChildren(node: RolePermissionNode): boolean {
  return (node.children?.length ?? 0) > 0;
}

/**
 * The collapsible rows of the tree, depth by depth: the areas with children
 * are depth 1, their children with children depth 2, and so on. Section
 * headings are not collapsible and have no depth.
 */
export interface PermissionLevels {
  /** Ids of the collapsible rows of each depth, `levels[0]` being depth 1. */
  levels: string[][];
  /** The collapsible row right above each nested collapsible row. */
  parents: Map<string, string>;
}

/** Sort the collapsible rows of the areas by depth, for the level buttons. */
export function buildPermissionLevels(
  areas: PermissionArea[],
): PermissionLevels {
  const levels: string[][] = [];
  const parents = new Map<string, string>();
  const visit = (
    node: RolePermissionNode,
    position: number,
    parentId?: string,
  ): void => {
    if (!hasChildren(node)) return;
    (levels[position] ??= []).push(node.id);
    if (parentId) parents.set(node.id, parentId);
    for (const child of node.children ?? []) {
      visit(child, position + 1, node.id);
    }
  };
  for (const area of areas) visit(area.node, 0);
  return { levels, parents };
}

/**
 * Depth "Expand one level" opens: the shallowest depth with a closed row.
 * That is also the shallowest depth with a closed row the user can see (all
 * its parents open), since the shallowest closed row above a hidden one is
 * itself shown. Every depth above it is fully open, so the whole depth opens
 * and each of its rows shows. `null` once everything is open.
 */
export function nextExpandDepth(
  levels: PermissionLevels,
  expanded: Set<string>,
): number | null {
  const position = levels.levels.findIndex((ids) =>
    ids.some((id) => !expanded.has(id)),
  );
  return position === -1 ? null : position + 1;
}

/**
 * Depth "Collapse one level" closes: the deepest depth with an open row the
 * user can see (all its parents open, depth by depth). `null` once nothing
 * shown is open.
 */
export function nextCollapseDepth(
  levels: PermissionLevels,
  expanded: Set<string>,
): number | null {
  // Rows shown open at the current depth: open, under a row shown open.
  let shownOpen = new Set<string>();
  let deepest: number | null = null;
  for (const [position, ids] of levels.levels.entries()) {
    const parentsShownOpen = shownOpen;
    shownOpen = new Set(
      ids.filter(
        (id) =>
          expanded.has(id) &&
          (position === 0 ||
            parentsShownOpen.has(levels.parents.get(id) ?? "")),
      ),
    );
    if (shownOpen.size === 0) break;
    deepest = position + 1;
  }
  return deepest;
}

/** Depths fully open from the top: the level the tree is expanded to. */
export function openDepth(
  levels: PermissionLevels,
  expanded: Set<string>,
): number {
  return (nextExpandDepth(levels, expanded) ?? levels.levels.length + 1) - 1;
}

/** The open rows once "Expand one level" opened the next depth. */
export function expandOneLevel(
  levels: PermissionLevels,
  expanded: Set<string>,
): Set<string> {
  const depth = nextExpandDepth(levels, expanded);
  if (depth === null) return expanded;
  return new Set([...expanded, ...(levels.levels[depth - 1] ?? [])]);
}

/**
 * The open rows once "Collapse one level" closed the deepest open depth. The
 * open rows below it, hidden under a closed parent, close too: reopening a
 * row then never brings back a deeper level the user collapsed.
 */
export function collapseOneLevel(
  levels: PermissionLevels,
  expanded: Set<string>,
): Set<string> {
  const depth = nextCollapseDepth(levels, expanded);
  if (depth === null) return expanded;
  const closing = new Set(levels.levels.slice(depth - 1).flat());
  return new Set([...expanded].filter((id) => !closing.has(id)));
}

/**
 * Split the tree into areas: a top-level permission with children is a
 * section, and each of its children an area; any other top-level permission
 * is an area of its own. Below an area, every node with children is a
 * collapsible row of its own, down to the leaves.
 */
export function buildPermissionAreas(
  tree: RolePermissionNode[],
  translate: (label: string) => string,
): PermissionArea[] {
  return tree.flatMap((node): PermissionArea[] =>
    hasChildren(node)
      ? (node.children ?? []).map((child) => ({
          node: child,
          sectionNode: node,
          section: translate(node.label),
        }))
      : [{ node }],
  );
}

/** How many permissions of a subtree are selected. */
export function countSelected(
  index: PermissionIndex,
  id: string,
  selection: Set<string>,
): SelectionCount {
  const subtree = index.subtrees.get(id) ?? [id];
  return {
    selected: subtree.filter((subId) => selection.has(subId)).length,
    total: subtree.length,
  };
}

/**
 * Checkbox state of a node, by the original roles form's rule: mixed while
 * only some of its descendants are selected, otherwise checked when the node
 * itself is. Clicking a mixed box grants, a checked one revokes.
 */
export function checkboxState(
  index: PermissionIndex,
  id: string,
  selection: Set<string>,
): SelectionState {
  const descendants = (index.subtrees.get(id) ?? [id]).slice(1);
  const selected = descendants.filter((descendant) =>
    selection.has(descendant),
  ).length;
  if (selected > 0 && selected < descendants.length) return "indeterminate";
  return selection.has(id);
}

/** Checkbox state of a count: all, some or none selected. */
export function selectionState(count: SelectionCount): SelectionState {
  if (count.selected === 0) return false;
  return count.selected === count.total ? true : "indeterminate";
}

/** The permissions a node declares it needs, as far as the tree knows them. */
function dependenciesOf(index: PermissionIndex, id: string): string[] {
  return (index.nodes.get(id)?.dependencies ?? []).filter((dependency) =>
    index.nodes.has(dependency),
  );
}

/**
 * Ids a set of permissions needs, the set included: the nodes above each one
 * and the permissions each one depends on, with what those need in turn.
 */
function requiredIds(index: PermissionIndex, ids: string[]): Set<string> {
  const required = new Set<string>();
  const pending = [...ids];
  for (let id = pending.shift(); id !== undefined; id = pending.shift()) {
    if (required.has(id)) continue;
    required.add(id);
    pending.push(...ancestorIds(index, id), ...dependenciesOf(index, id));
  }
  return required;
}

/**
 * Grant a node's whole subtree with everything it needs: every node above it
 * (a component needs its page, a page its category) and the permissions it
 * depends on (a table's edit needs its view, which loads the row). The tree
 * nests by id, so the nodes above are the registered ids it sits under; the
 * server completes a saved role the same way, with the unregistered rest (a
 * lifted `media.upload` gets `media` there). Ids the user may not grant are
 * skipped.
 */
export function grantPermission(
  index: PermissionIndex,
  selection: Set<string>,
  id: string,
  canGrant: (permissionId: string) => boolean,
): PermissionGrant {
  const subtree = new Set(index.subtrees.get(id) ?? [id]);
  const wanted = requiredIds(index, [...subtree]);
  const added = [...wanted].filter(
    (wantedId) => !selection.has(wantedId) && canGrant(wantedId),
  );
  return {
    selection: new Set([...selection, ...added]),
    autoAdded: added.filter((addedId) => !subtree.has(addedId)),
  };
}

/**
 * The selected nodes that depend on a removed one, with their subtrees added
 * to `removed`, until none is left: a table's edit goes with its view, which
 * the server would otherwise put back when the role is saved. Returns the
 * nodes taken this way.
 */
function removeDependents(
  index: PermissionIndex,
  selection: Set<string>,
  removed: Set<string>,
): string[] {
  const dependents: string[] = [];
  const dependsOnRemoved = (id: string) =>
    !removed.has(id) &&
    dependenciesOf(index, id).some((dependency) => removed.has(dependency));
  for (let next = [...selection].find(dependsOnRemoved); next; ) {
    dependents.push(next);
    for (const descendant of index.subtrees.get(next) ?? [next]) {
      removed.add(descendant);
    }
    next = [...selection].find(dependsOnRemoved);
  }
  return dependents;
}

/**
 * Revoke a node's subtree, and what depends on it. A node above them goes
 * too when none of its descendants is left once they are gone: a page is
 * granted for its components. Same rule as the original roles form, which
 * judges every ancestor against that one state, before any ancestor is
 * dropped: an ancestor above one dropped this way still saw it selected, and
 * stays.
 */
export function revokePermission(
  index: PermissionIndex,
  selection: Set<string>,
  id: string,
): Set<string> {
  const removed = new Set(index.subtrees.get(id) ?? [id]);
  const dependents = removeDependents(index, selection, removed);
  const remaining = new Set(
    [...selection].filter((kept) => !removed.has(kept)),
  );
  const judged = new Set(
    [id, ...dependents].flatMap((revoked) => ancestorIds(index, revoked)),
  );
  const emptied = [...judged].filter((ancestor) => {
    const descendants = (index.subtrees.get(ancestor) ?? []).slice(1);
    return !descendants.some((descendant) => remaining.has(descendant));
  });
  for (const ancestor of emptied) remaining.delete(ancestor);
  return remaining;
}

function matchesQuery(
  node: RolePermissionNode,
  query: string,
  translate: (label: string) => string,
): boolean {
  return [translate(node.label), node.description, node.id]
    .filter((text): text is string => Boolean(text))
    .some((text) => translate(text).toLowerCase().includes(query));
}

function areaIdOf(
  index: PermissionIndex,
  areaIds: Set<string>,
  id: string,
): string {
  return (
    [id, ...ancestorIds(index, id)].find((candidate) =>
      areaIds.has(candidate),
    ) ?? id
  );
}

/**
 * Permissions matching a query, each under the path of its ancestors. Every
 * node is searched, the section and area headings included.
 */
export function searchPermissions(
  index: PermissionIndex,
  areas: PermissionArea[],
  query: string,
  translate: (label: string) => string,
): PermissionSearchHit[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const areaIds = new Set(areas.map((area) => area.node.id));
  return index.allIds
    .map((id) => index.nodes.get(id))
    .filter((node): node is RolePermissionNode => Boolean(node))
    .filter((node) => matchesQuery(node, normalized, translate))
    .map((node) => ({
      heading: joinPath(
        ancestorIds(index, node.id)
          .reverse()
          .map((ancestorId) =>
            translate(index.nodes.get(ancestorId)?.label ?? ""),
          ),
      ),
      node,
      areaId: areaIdOf(index, areaIds, node.id),
    }));
}

function warningOf(index: PermissionIndex, id: string): string | undefined {
  return index.nodes.get(id)?.warning;
}

/**
 * Distinct warnings of the selected permissions below a node, itself
 * excluded: what a closed row hides once a parent ticked them.
 */
export function selectedWarningsBelow(
  index: PermissionIndex,
  id: string,
  selection: Set<string>,
): string[] {
  const descendants = (index.subtrees.get(id) ?? []).slice(1);
  const warnings = descendants
    .filter((descendant) => selection.has(descendant))
    .map((descendant) => warningOf(index, descendant))
    .filter((warning): warning is string => Boolean(warning));
  return [...new Set(warnings)];
}

/**
 * The selected permissions that carry a warning, in tree order, each named
 * under its area ("Members › Edit") so a summary can list them.
 */
export function selectedWarningLabels(
  index: PermissionIndex,
  areas: PermissionArea[],
  selection: Set<string>,
  translate: (label: string) => string,
): string[] {
  const areaIds = new Set(areas.map((area) => area.node.id));
  return index.allIds
    .filter((id) => selection.has(id) && warningOf(index, id))
    .map((id) => {
      const areaId = areaIdOf(index, areaIds, id);
      const labels = [index.nodes.get(id)?.label ?? id];
      if (areaId !== id) labels.unshift(index.nodes.get(areaId)?.label ?? "");
      return joinPath(labels.map((label) => translate(label)));
    });
}

/** Joins path labels the way the editor shows them. */
export function joinPath(labels: string[]): string {
  return labels.join(PATH_SEPARATOR);
}

/** Ids added to and removed from a saved permission set. */
export interface PermissionDiff {
  added: string[];
  removed: string[];
}

/** Compare the edited selection with the saved permissions. */
export function diffPermissions(
  saved: string[],
  selection: Set<string>,
): PermissionDiff {
  const savedIds = new Set(saved);
  return {
    added: [...selection].filter((id) => !savedIds.has(id)),
    removed: [...savedIds].filter((id) => !selection.has(id)),
  };
}

/** A run of text, marked when it matches the search query. */
export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

/** Split a label around the occurrences of a query, for highlighting. */
export function highlightSegments(
  text: string,
  query: string,
): HighlightSegment[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [{ text, isMatch: false }];
  const segments: HighlightSegment[] = [];
  const lowered = text.toLowerCase();
  let cursor = 0;
  let found = lowered.indexOf(normalized, cursor);
  while (found !== -1) {
    if (found > cursor) {
      segments.push({ text: text.slice(cursor, found), isMatch: false });
    }
    cursor = found + normalized.length;
    segments.push({ text: text.slice(found, cursor), isMatch: true });
    found = lowered.indexOf(normalized, cursor);
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isMatch: false });
  }
  return segments;
}
