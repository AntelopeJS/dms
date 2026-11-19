import type { JsonValue } from "../../../../dms-core/app/types/json";
import { isNumber, isString } from "../../../../dms-core/app/utils/type-check";
import type { PreviewHeaderAction } from "./blockPreviewMessages";
import { isHeaderColor, isHeaderVariant } from "./blockPreviewMessages";
import {
  isJsonObject,
  isJsonValue,
  isObjectValue,
  type JsonObject,
  type JsonWritable,
} from "./json";

/**
 * `mockups/<name>/spec.json` as the editor reads and writes it: the spec as
 * written, `fixture:` references and every field the editor does not know
 * kept as they are.
 */

/** A node of a page tree, as written. */
export interface MockupSpecNode {
  type?: string;
  componentName?: string;
  options?: JsonObject;
  children?: MockupSpecNode[];
  id?: string;
  slot?: string;
  colSpan?: number;
  [field: string]: JsonValue | MockupSpecNode[] | undefined;
}

/** One page of a spec, as written. */
export interface MockupSpecPage {
  id: string;
  title: string;
  tree: MockupSpecNode[];
  [field: string]: JsonValue | MockupSpecNode[];
}

/** The whole spec, as written. */
export interface MockupSpecDocument {
  pages: MockupSpecPage[];
  [field: string]: JsonValue | MockupSpecPage[];
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

/** Leaves room for a `-<n>` suffix under the 64 characters an id has. */
const ID_MAX_BASE = 60;
const ID_SUFFIX = /-\d+$/;

/** `text` as a URL slug a page or category id may be: lowercase, dashes, no accents. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ID_MAX_BASE);
}

/** `wanted`, or the first `<base>-<n>` none of `taken` is yet. */
export function freeId(taken: ReadonlySet<string>, wanted: string): string {
  if (!taken.has(wanted)) return wanted;
  const base = wanted.replace(ID_SUFFIX, "");
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

const POINTER_PATTERN = /^\/pages\/(\d+)\/tree\/(\d+)((?:\/children\/\d+)*)$/;
const STAMPED_ID = /^b-[a-z0-9]{8}$/;

/** The id an author wrote on `node`; none when its only id is the one the backend stamps on a block a note is on. */
export function authoredId(node: MockupSpecNode): string | undefined {
  return node.id !== undefined && STAMPED_ID.test(node.id)
    ? undefined
    : node.id;
}

function isOptional<Value extends JsonValue>(
  value: JsonValue | undefined,
  guard: (entry: JsonValue) => entry is Value,
): value is Value | undefined {
  return value === undefined || guard(value);
}

/** A button right of a page's title, as a spec page holds it. */
export type MockupHeaderAction = PreviewHeaderAction;

/** The header buttons a page holds, in order, as far as each reads cleanly. */
export function pageHeaderActions(page: MockupSpecPage): MockupHeaderAction[] {
  const { headerActions } = page;
  if (!Array.isArray(headerActions)) return [];
  return headerActions.flatMap((entry): MockupHeaderAction[] => {
    if (!isJsonObject(entry)) return [];
    const { label, icon, color, variant } = entry;
    return [
      {
        label: isString(label) ? label : "",
        icon: isString(icon) ? icon : undefined,
        color: isHeaderColor(color) ? color : undefined,
        variant: isHeaderVariant(variant) ? variant : undefined,
      },
    ];
  });
}

/** The header button as the spec writes it: a field that is not set is not written. */
export function headerActionJson(action: MockupHeaderAction): JsonObject {
  const written: JsonObject = { label: action.label };
  if (action.icon) written.icon = action.icon;
  if (action.color) written.color = action.color;
  if (action.variant) written.variant = action.variant;
  return written;
}

/** The text field `name` of a page, empty when it holds none. */
export function pageText(page: MockupSpecPage, name: string): string {
  const value = Object.hasOwn(page, name) ? page[name] : undefined;
  return isString(value) ? value : "";
}

/** The fixtures a page holds, keyed as written; none when it holds no object of them. */
export function pageFixtures(page: MockupSpecPage): JsonObject {
  const { fixtures } = page;
  return !Array.isArray(fixtures) && isObjectValue(fixtures) ? fixtures : {};
}

function isWrittenNode(value: JsonValue): value is JsonObject & MockupSpecNode {
  if (!isObjectValue(value)) return false;
  return (
    isOptional(value.type, isString) &&
    isOptional(value.componentName, isString) &&
    isOptional(value.options, isObjectValue) &&
    isOptional(value.id, isString) &&
    isOptional(value.slot, isString) &&
    isOptional(value.colSpan, isNumber) &&
    (value.children === undefined ||
      (Array.isArray(value.children) && value.children.every(isWrittenNode)))
  );
}

/** Whether `value` is JSON, and a node whose known fields have their types, at every depth. */
export function isMockupSpecNode(value: unknown): value is MockupSpecNode {
  return isJsonValue(value) && isWrittenNode(value);
}

function isMockupSpecPage(
  value: JsonValue,
): value is JsonObject & MockupSpecPage {
  return (
    isObjectValue(value) &&
    isString(value.id) &&
    isString(value.title) &&
    Array.isArray(value.tree) &&
    value.tree.every(isWrittenNode)
  );
}

/** `page` with an empty tree when it writes none, as a custom page may. */
function withTree(page: JsonValue): JsonValue {
  return isObjectValue(page) && page.tree === undefined
    ? { ...page, tree: [] }
    : page;
}

/**
 * The spec `value` holds, or undefined when it is not JSON or not a spec the
 * editor can change. A page writing no tree, a custom page, holds an empty
 * one.
 */
export function parseMockupSpec(
  value: JsonWritable | undefined,
): MockupSpecDocument | undefined {
  if (!isJsonObject(value) || !Array.isArray(value.pages)) return undefined;
  const pages = value.pages.map(withTree);
  if (!pages.every(isMockupSpecPage)) return undefined;
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

/**
 * The index of the spec page the editing panels work on while `id` is on
 * screen: its own, else the first page's, since a page the spec lacks, a
 * table's generated form page, is edited by no panel.
 */
export function editedIndex(
  spec: MockupSpecDocument | undefined,
  id: string | undefined,
): number {
  return spec && id !== undefined ? Math.max(0, pageIndexOf(spec, id)) : 0;
}

/**
 * The layout path the preview gives the node at `pointer`, as the compiler
 * names it: `block-<root index>`, then each child's id, or its index.
 */
export function layoutPathOf(
  spec: MockupSpecDocument,
  pointer: string,
): string | undefined {
  const address = parseNodePointer(pointer);
  const page = address && spec.pages[address.page];
  if (!address || !page) return undefined;
  const [root, ...deeper] = address.steps;
  let nodes: MockupSpecNode[] | undefined = page.tree[root ?? -1]?.children;
  let path = `block-${root}`;
  for (const step of deeper) {
    const node = nodes?.[step];
    if (!node) return undefined;
    path += `.${node.id ?? step}`;
    nodes = node.children;
  }
  return page.tree[root ?? -1] ? path : undefined;
}

/** The pointer of each node from the page root down to `pointer`, itself included. */
export function ancestorPointers(pointer: string): string[] {
  const address = parseNodePointer(pointer);
  if (!address) return [];
  return address.steps.map((_step, depth) =>
    nodePointer({ ...address, steps: address.steps.slice(0, depth + 1) }),
  );
}
