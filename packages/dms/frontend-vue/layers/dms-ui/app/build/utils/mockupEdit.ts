import {
  MOCKUP_MAX_PAGES,
  MOCKUP_PAGE_ID_PATTERN,
  isWithinPointer,
  nodeAtAddress,
  nodePointer,
  pageFixtures,
  pageIndexOf,
  parseNodePointer,
  siblingsAt,
  type MockupNodeAddress,
  type MockupSpecDocument,
  type MockupSpecNode,
  type MockupSpecPage,
} from "./mockupSpec";

/** One change the `/mockup` editor makes to a spec. */
export type MockupEdit =
  | {
      kind: "setOption" | "setText";
      pointer: string;
      key: string;
      /** Undefined removes the option. */
      value: unknown;
    }
  | {
      kind: "insertNode";
      /** The node to insert under, null for the page's own tree. */
      parent: string | null;
      /** The page id. */
      page: string;
      index: number;
      node: MockupSpecNode;
      /** Fixtures the node reads, added to the page by the same edit. */
      fixtures?: Record<string, unknown>;
    }
  | {
      kind: "moveNode";
      from: string;
      /** The node to move under, null for the page's own tree. */
      parent: string | null;
      /** Where the node lands among its new siblings, counted without it. */
      index: number;
    }
  | { kind: "duplicateNode"; pointer: string }
  | { kind: "removeNode"; pointer: string }
  | {
      kind: "replaceNode";
      pointer: string;
      node: MockupSpecNode;
      /** Fixtures the node reads, added to its page by the same edit. */
      fixtures?: Record<string, unknown>;
    }
  | { kind: "addPage"; title: string }
  | { kind: "updatePage"; page: string; title?: string; id?: string }
  | { kind: "movePage"; from: number; to: number }
  | { kind: "removePage"; page: string };

/**
 * What an edit leaves: the new spec, the node it leaves selected and the page
 * it leaves open. An edit that cannot apply answers the very spec it was given.
 */
export interface MockupEditResult {
  spec: MockupSpecDocument;
  select?: string;
  /** Set by the page edits: the page to show next. */
  page?: string;
}

type ListUpdate = (list: MockupSpecNode[]) => MockupSpecNode[];

const PAGE_ID_FALLBACK = "page";
/** Leaves room for a `-<n>` suffix under the 64 characters a page id has. */
const PAGE_ID_MAX_BASE = 60;
const ID_SUFFIX = /-\d+$/;
/** The id the backend stamps on a block a note is on: a copy keeps none. */
const STAMPED_ID = /^b-[a-z0-9]{8}$/;

function updateList(
  list: MockupSpecNode[],
  steps: readonly number[],
  update: ListUpdate,
): MockupSpecNode[] {
  const [step, ...rest] = steps;
  if (step === undefined) return update(list);
  return list.map((node, index) =>
    index === step
      ? { ...node, children: updateList(node.children ?? [], rest, update) }
      : node,
  );
}

/** The spec with the list under `parentSteps` of page `page` rewritten. */
function updateSiblings(
  spec: MockupSpecDocument,
  page: number,
  parentSteps: readonly number[],
  update: ListUpdate,
): MockupSpecDocument {
  return {
    ...spec,
    pages: spec.pages.map((entry, index) =>
      index === page
        ? { ...entry, tree: updateList(entry.tree, parentSteps, update) }
        : entry,
    ),
  };
}

function replaceAt<Item>(list: Item[], index: number, item: Item): Item[] {
  return list.map((entry, position) => (position === index ? item : entry));
}

function insertAt<Item>(list: Item[], index: number, item: Item): Item[] {
  return [...list.slice(0, index), item, ...list.slice(index)];
}

function removeAt<Item>(list: Item[], index: number): Item[] {
  return list.filter((_entry, position) => position !== index);
}

/** `wanted`, or the first `<base>-<n>` no sibling carries yet. */
function freeId(taken: ReadonlySet<string>, wanted: string): string {
  if (!taken.has(wanted)) return wanted;
  const base = wanted.replace(ID_SUFFIX, "");
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/** `node` with an id none of `siblings` carries, when it has an id at all. */
function withFreeId(
  node: MockupSpecNode,
  siblings: readonly MockupSpecNode[],
): MockupSpecNode {
  if (node.id === undefined) return node;
  const taken = new Set(siblings.flatMap((sibling) => sibling.id ?? []));
  const id = freeId(taken, node.id);
  return id === node.id ? node : { ...node, id };
}

function withOption(
  node: MockupSpecNode,
  key: string,
  value: unknown,
): MockupSpecNode {
  const current = node.options ?? {};
  const entries = Object.entries(current).flatMap(
    ([name, entry]): Array<[string, unknown]> => {
      if (name !== key) return [[name, entry]];
      return value === undefined ? [] : [[name, value]];
    },
  );
  if (!Object.hasOwn(current, key) && value !== undefined) {
    entries.push([key, value]);
  }
  const { options: _previous, ...rest } = node;
  return entries.length
    ? { ...rest, options: Object.fromEntries(entries) }
    : rest;
}

interface Located {
  address: MockupNodeAddress;
  node: MockupSpecNode;
  siblings: MockupSpecNode[];
  index: number;
  parentSteps: number[];
}

function locate(
  spec: MockupSpecDocument,
  pointer: string,
): Located | undefined {
  const address = parseNodePointer(pointer);
  const page = address && spec.pages[address.page];
  if (!address || !page) return undefined;
  const node = nodeAtAddress(spec, address);
  const siblings = siblingsAt(page, address.steps);
  const index = address.steps.at(-1);
  if (!node || !siblings || index === undefined) return undefined;
  return {
    address,
    node,
    siblings,
    index,
    parentSteps: address.steps.slice(0, -1),
  };
}

/** The steps of the list a node is inserted in, or undefined when it is not a list of `page`. */
function targetSteps(
  spec: MockupSpecDocument,
  page: number,
  parent: string | null,
): number[] | undefined {
  if (parent === null) return spec.pages[page] ? [] : undefined;
  const located = locate(spec, parent);
  if (!located || located.address.page !== page) return undefined;
  return located.address.steps;
}

function listAt(
  spec: MockupSpecDocument,
  page: number,
  steps: readonly number[],
): MockupSpecNode[] {
  const entry = spec.pages[page];
  if (!entry) return [];
  if (!steps.length) return entry.tree;
  return nodeAtAddress(spec, { page, steps: [...steps] })?.children ?? [];
}

function insertNode(
  spec: MockupSpecDocument,
  page: number,
  steps: number[],
  index: number,
  node: MockupSpecNode,
): MockupEditResult {
  const list = listAt(spec, page, steps);
  const at = Math.max(0, Math.min(index, list.length));
  const placed = withFreeId(node, list);
  return {
    spec: updateSiblings(spec, page, steps, (current) =>
      insertAt(current, at, placed),
    ),
    select: nodePointer({ page, steps: [...steps, at] }),
  };
}

/** The spec with `added` in the fixtures of page `page`, which keep what they held. */
function withFixtures(
  spec: MockupSpecDocument,
  page: number,
  added: Record<string, unknown> | undefined,
): MockupSpecDocument {
  if (!added || !Object.keys(added).length) return spec;
  return {
    ...spec,
    pages: spec.pages.map((entry, index) =>
      index === page
        ? { ...entry, fixtures: { ...added, ...pageFixtures(entry) } }
        : entry,
    ),
  };
}

/** `steps` as they read once the node at `removed` is gone from its list. */
function stepsAfterRemoval(
  steps: readonly number[],
  removed: readonly number[],
): number[] {
  const depth = removed.length - 1;
  const sameParent = removed
    .slice(0, depth)
    .every((step, level) => steps[level] === step);
  const step = steps[depth];
  const removedStep = removed[depth];
  if (!sameParent || step === undefined || removedStep === undefined) {
    return [...steps];
  }
  return step > removedStep
    ? replaceAt([...steps], depth, step - 1)
    : [...steps];
}

function moveNode(
  spec: MockupSpecDocument,
  edit: Extract<MockupEdit, { kind: "moveNode" }>,
): MockupEditResult {
  const from = locate(spec, edit.from);
  if (!from) return { spec };
  if (edit.parent !== null && isWithinPointer(edit.parent, edit.from)) {
    return { spec };
  }
  const steps = targetSteps(spec, from.address.page, edit.parent);
  if (!steps) return { spec };
  const target = stepsAfterRemoval(steps, from.address.steps);
  const isSameList =
    target.length === from.parentSteps.length &&
    target.every((step, level) => from.parentSteps[level] === step);
  if (isSameList && edit.index === from.index) return { spec };
  const removed = updateSiblings(
    spec,
    from.address.page,
    from.parentSteps,
    (list) => removeAt(list, from.index),
  );
  return insertNode(removed, from.address.page, target, edit.index, from.node);
}

/** `node` and its children without the ids the backend stamped, so their notes stay on the original. */
function withoutStamps(node: MockupSpecNode): MockupSpecNode {
  const { id, ...rest } = node;
  const copy: MockupSpecNode =
    id !== undefined && STAMPED_ID.test(id) ? rest : { ...node };
  if (node.children) copy.children = node.children.map(withoutStamps);
  return copy;
}

function duplicateNode(
  spec: MockupSpecDocument,
  pointer: string,
): MockupEditResult {
  const from = locate(spec, pointer);
  if (!from) return { spec };
  return insertNode(
    spec,
    from.address.page,
    from.parentSteps,
    from.index + 1,
    withoutStamps(structuredClone(from.node)),
  );
}

function updateNode(
  spec: MockupSpecDocument,
  pointer: string,
  update: (node: MockupSpecNode, siblings: MockupSpecNode[]) => MockupSpecNode,
): MockupEditResult {
  const from = locate(spec, pointer);
  if (!from) return { spec };
  const next = update(from.node, from.siblings);
  return {
    spec: updateSiblings(spec, from.address.page, from.parentSteps, (list) =>
      replaceAt(list, from.index, next),
    ),
    select: pointer,
  };
}

function removeNode(
  spec: MockupSpecDocument,
  pointer: string,
): MockupEditResult {
  const from = locate(spec, pointer);
  if (!from) return { spec };
  return {
    spec: updateSiblings(spec, from.address.page, from.parentSteps, (list) =>
      removeAt(list, from.index),
    ),
  };
}

/** The node that takes the place of `previous`, keeping where it sat. */
function replacement(
  previous: MockupSpecNode,
  next: MockupSpecNode,
): MockupSpecNode {
  const placed: MockupSpecNode = { ...next };
  if (previous.id !== undefined) placed.id = previous.id;
  if (previous.slot !== undefined) placed.slot = previous.slot;
  if (previous.colSpan !== undefined) placed.colSpan = previous.colSpan;
  return placed;
}

/** `text` as a URL slug a page id may be: lowercase, dashes, no accents. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PAGE_ID_MAX_BASE);
}

function pageIdFor(spec: MockupSpecDocument, title: string): string {
  const taken = new Set(spec.pages.map((page) => page.id));
  return freeId(taken, slugify(title) || PAGE_ID_FALLBACK);
}

function addPage(spec: MockupSpecDocument, title: string): MockupEditResult {
  if (spec.pages.length >= MOCKUP_MAX_PAGES) return { spec };
  const page: MockupSpecPage = { id: pageIdFor(spec, title), title, tree: [] };
  return { spec: { ...spec, pages: [...spec.pages, page] }, page: page.id };
}

function updatePage(
  spec: MockupSpecDocument,
  edit: Extract<MockupEdit, { kind: "updatePage" }>,
): MockupEditResult {
  const index = pageIndexOf(spec, edit.page);
  const page = spec.pages[index];
  if (!page) return { spec };
  const id = edit.id ?? page.id;
  const isIdFree = id === page.id || pageIndexOf(spec, id) === -1;
  if (!MOCKUP_PAGE_ID_PATTERN.test(id) || !isIdFree) return { spec };
  const next = { ...page, id, title: edit.title ?? page.title };
  return {
    spec: { ...spec, pages: replaceAt(spec.pages, index, next) },
    page: id,
  };
}

function movePage(
  spec: MockupSpecDocument,
  from: number,
  to: number,
): MockupEditResult {
  const page = spec.pages[from];
  const isInRange = to >= 0 && to < spec.pages.length;
  if (!page || !isInRange || from === to) return { spec };
  return {
    spec: { ...spec, pages: insertAt(removeAt(spec.pages, from), to, page) },
    page: page.id,
  };
}

function removePage(spec: MockupSpecDocument, id: string): MockupEditResult {
  const index = pageIndexOf(spec, id);
  if (index === -1 || spec.pages.length === 1) return { spec };
  const pages = removeAt(spec.pages, index);
  return {
    spec: { ...spec, pages },
    page: pages[Math.max(0, index - 1)]?.id,
  };
}

function applyNodeEdit(
  spec: MockupSpecDocument,
  edit: Exclude<
    MockupEdit,
    { kind: "addPage" | "updatePage" | "movePage" | "removePage" }
  >,
): MockupEditResult {
  switch (edit.kind) {
    case "setOption":
    case "setText":
      return updateNode(spec, edit.pointer, (node) =>
        withOption(node, edit.key, edit.value),
      );
    case "insertNode": {
      const page = pageIndexOf(spec, edit.page);
      const steps = targetSteps(spec, page, edit.parent);
      if (!steps) return { spec };
      const inserted = insertNode(spec, page, steps, edit.index, edit.node);
      return {
        ...inserted,
        spec: withFixtures(inserted.spec, page, edit.fixtures),
      };
    }
    case "moveNode":
      return moveNode(spec, edit);
    case "duplicateNode":
      return duplicateNode(spec, edit.pointer);
    case "removeNode":
      return removeNode(spec, edit.pointer);
    case "replaceNode": {
      const replaced = updateNode(spec, edit.pointer, (node, siblings) =>
        withFreeId(
          replacement(node, edit.node),
          siblings.filter((sibling) => sibling !== node),
        ),
      );
      const page = parseNodePointer(edit.pointer)?.page;
      return page === undefined
        ? replaced
        : {
            ...replaced,
            spec: withFixtures(replaced.spec, page, edit.fixtures),
          };
    }
  }
}

/**
 * Applies one edit to a spec without touching it: every field the edit does
 * not name is kept, sibling ids stay unique, and a node never moves into
 * itself.
 */
export function applyMockupEdit(
  spec: MockupSpecDocument,
  edit: MockupEdit,
): MockupEditResult {
  switch (edit.kind) {
    case "addPage":
      return addPage(spec, edit.title);
    case "updatePage":
      return updatePage(spec, edit);
    case "movePage":
      return movePage(spec, edit.from, edit.to);
    case "removePage":
      return removePage(spec, edit.page);
    default:
      return applyNodeEdit(spec, edit);
  }
}
