import {
  isNumber,
  isObject,
  isString,
} from "../../../../dms-core/app/utils/type-check";

/**
 * `mockups/<name>/spec.json` as the editor reads and writes it: the spec as
 * written, `fixture:` references and every field the editor does not know
 * kept as they are.
 */

/** A node of a page tree, as written. */
export interface MockupSpecNode {
  type?: string;
  componentName?: string;
  options?: Record<string, unknown>;
  children?: MockupSpecNode[];
  id?: string;
  slot?: string;
  colSpan?: number;
  [field: string]: unknown;
}

/** One page of a spec, as written. */
export interface MockupSpecPage {
  id: string;
  title: string;
  tree: MockupSpecNode[];
  [field: string]: unknown;
}

/** The whole spec, as written. */
export interface MockupSpecDocument {
  pages: MockupSpecPage[];
  [field: string]: unknown;
}

/** Where a node sits: its page's index, then its index at each level down. */
export interface MockupNodeAddress {
  page: number;
  /** Never empty: the index in the page's tree, then in each `children`. */
  steps: number[];
}

/** The node type of a custom zone. */
export const MOCKUP_SKETCH_TYPE = "sketch";

/** A page id: the URL slug the spec allows. */
export const MOCKUP_PAGE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** How many pages a spec holds at most. */
export const MOCKUP_MAX_PAGES = 50;

const POINTER_PATTERN = /^\/pages\/(\d+)\/tree\/(\d+)((?:\/children\/\d+)*)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value) && value !== null && !Array.isArray(value);
}

function isOptional<Value>(
  value: unknown,
  guard: (entry: unknown) => entry is Value,
): boolean {
  return value === undefined || guard(value);
}

/** Whether `value` is a node whose known fields have their types, at every depth. */
export function isMockupSpecNode(value: unknown): value is MockupSpecNode {
  if (!isRecord(value)) return false;
  return (
    isOptional(value.type, isString) &&
    isOptional(value.componentName, isString) &&
    isOptional(value.options, isRecord) &&
    isOptional(value.id, isString) &&
    isOptional(value.slot, isString) &&
    isOptional(value.colSpan, isNumber) &&
    (value.children === undefined ||
      (Array.isArray(value.children) && value.children.every(isMockupSpecNode)))
  );
}

function isMockupSpecPage(value: unknown): value is MockupSpecPage {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    Array.isArray(value.tree) &&
    value.tree.every(isMockupSpecNode)
  );
}

/** The spec `value` holds, or undefined when it is not one the editor can change. */
export function parseMockupSpec(
  value: unknown,
): MockupSpecDocument | undefined {
  if (!isRecord(value)) return undefined;
  const { pages } = value;
  if (!Array.isArray(pages) || !pages.every(isMockupSpecPage)) {
    return undefined;
  }
  return { ...value, pages };
}

/** The address a spec pointer names, or undefined when it names no node. */
export function parseNodePointer(
  pointer: string,
): MockupNodeAddress | undefined {
  const match = POINTER_PATTERN.exec(pointer);
  if (!match) return undefined;
  const [, page, root, rest] = match;
  const deeper = (rest ?? "")
    .split("/children/")
    .filter((step) => step !== "")
    .map(Number);
  return { page: Number(page), steps: [Number(root), ...deeper] };
}

/** The spec pointer of the node at `address`. */
export function nodePointer(address: MockupNodeAddress): string {
  const [root, ...deeper] = address.steps;
  return `/pages/${address.page}/tree/${root ?? 0}${deeper
    .map((step) => `/children/${step}`)
    .join("")}`;
}

/** The pointer of the node holding the one at `pointer`, null for a root node. */
export function parentPointer(pointer: string): string | null | undefined {
  const address = parseNodePointer(pointer);
  if (!address) return undefined;
  if (address.steps.length === 1) return null;
  return nodePointer({ ...address, steps: address.steps.slice(0, -1) });
}

/** Whether `pointer` names `ancestor` or a node under it. */
export function isWithinPointer(pointer: string, ancestor: string): boolean {
  return pointer === ancestor || pointer.startsWith(`${ancestor}/`);
}

/** The list the node at `steps` sits in: the page's tree, or its parent's children. */
export function siblingsAt(
  page: MockupSpecPage,
  steps: readonly number[],
): MockupSpecNode[] | undefined {
  let list: MockupSpecNode[] | undefined = page.tree;
  for (const step of steps.slice(0, -1)) {
    list = list?.[step]?.children;
  }
  return list;
}

/** The node at `address`, or undefined when the spec has none there. */
export function nodeAtAddress(
  spec: MockupSpecDocument,
  address: MockupNodeAddress,
): MockupSpecNode | undefined {
  const page = spec.pages[address.page];
  if (!page) return undefined;
  return siblingsAt(page, address.steps)?.[address.steps.at(-1) ?? -1];
}

/** The node `pointer` names, or undefined when the spec has none there. */
export function nodeAt(
  spec: MockupSpecDocument,
  pointer: string,
): MockupSpecNode | undefined {
  const address = parseNodePointer(pointer);
  return address ? nodeAtAddress(spec, address) : undefined;
}

/** The index of the page `id`, or -1. */
export function pageIndexOf(spec: MockupSpecDocument, id: string): number {
  return spec.pages.findIndex((page) => page.id === id);
}

/** The pointer of each node from the page root down to `pointer`, itself included. */
export function ancestorPointers(pointer: string): string[] {
  const address = parseNodePointer(pointer);
  if (!address) return [];
  return address.steps.map((_step, depth) =>
    nodePointer({ ...address, steps: address.steps.slice(0, depth + 1) }),
  );
}
