import { isString } from "../../../../dms-core/app/utils/type-check";
import type { MockupBlockType } from "./mockupCatalog";
import {
  MOCKUP_SKETCH_TYPE,
  ancestorPointers,
  nodeAt,
  nodePointer,
  parseNodePointer,
  type MockupSpecDocument,
  type MockupSpecNode,
} from "./mockupSpec";

/** One row of the Layers tab: a node of the page, indented by its depth. */
export interface MockupOutlineRow {
  pointer: string;
  depth: number;
  label: string;
  icon?: string;
}

const LABEL_OPTIONS = ["title", "label", "caption", "text"];
const SKETCH_ICON = "i-ph-pencil-ruler";

/** What the editor calls a node: its own title, else its id, else its block's name. */
export function nodeLabel(
  node: MockupSpecNode,
  catalog: ReadonlyMap<string, MockupBlockType>,
): string {
  const options = node.options ?? {};
  for (const key of LABEL_OPTIONS) {
    const value = Object.hasOwn(options, key) ? options[key] : undefined;
    if (isString(value) && value.trim()) return value.trim();
  }
  if (node.id) return node.id;
  return blockName(node, catalog);
}

/** The name of a node's block type, as the palette shows it. */
export function blockName(
  node: MockupSpecNode,
  catalog: ReadonlyMap<string, MockupBlockType>,
): string {
  const type = node.type ?? node.componentName ?? "";
  return catalog.get(type)?.meta.name ?? type;
}

/** The icon of a node's block type, as the palette shows it. */
export function blockIcon(
  node: MockupSpecNode,
  catalog: ReadonlyMap<string, MockupBlockType>,
): string | undefined {
  if (node.type === MOCKUP_SKETCH_TYPE) return SKETCH_ICON;
  return catalog.get(node.type ?? "")?.meta.icon;
}

/** Every node of page `page`, depth first, as the Layers tab lists them. */
export function outlineRows(
  spec: MockupSpecDocument,
  page: number,
  catalog: ReadonlyMap<string, MockupBlockType>,
): MockupOutlineRow[] {
  const rows: MockupOutlineRow[] = [];
  function walk(nodes: readonly MockupSpecNode[], steps: number[]): void {
    nodes.forEach((node, index) => {
      const at = [...steps, index];
      rows.push({
        pointer: nodePointer({ page, steps: at }),
        depth: steps.length,
        label: nodeLabel(node, catalog),
        icon: blockIcon(node, catalog),
      });
      walk(node.children ?? [], at);
    });
  }
  walk(spec.pages[page]?.tree ?? [], []);
  return rows;
}

/** Where a node sits, as the inspector heads it: its page, then each node above it. */
export function breadcrumb(
  spec: MockupSpecDocument,
  pointer: string,
  catalog: ReadonlyMap<string, MockupBlockType>,
): string[] {
  const page = spec.pages[parseNodePointer(pointer)?.page ?? -1];
  const ancestors = ancestorPointers(pointer).flatMap((at) => {
    const node = nodeAt(spec, at);
    return node ? [node.id ?? nodeLabel(node, catalog)] : [];
  });
  return page ? [page.title, ...ancestors] : ancestors;
}
