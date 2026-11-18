import {
  type BlockTypeDescriptor,
  ListBlockTypes,
} from "@antelopejs/interface-dms/base/block-types";
import type { MockupNode } from "./model";

/** The registered block types, looked up as `DmsBlockPreview` does. */
export interface Catalog {
  byType: Map<string, BlockTypeDescriptor>;
  byComponent: Map<string, BlockTypeDescriptor>;
}

/** Same comparison as the preview's: case, separators and `dms` prefix aside. */
function normalizeComponentName(name: string): string {
  return name
    .replace(/^dms[-_]?/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

export function readCatalog(): Catalog {
  const descriptors = ListBlockTypes();
  const byComponent = new Map<string, BlockTypeDescriptor>();
  for (const descriptor of descriptors) {
    const key = normalizeComponentName(descriptor.componentName);
    if (!byComponent.has(key)) byComponent.set(key, descriptor);
  }
  return {
    byType: new Map(
      descriptors.map((descriptor) => [descriptor.type, descriptor]),
    ),
    byComponent,
  };
}

/** The registered block type a node draws, by its `type`, else its `componentName`. */
export function descriptorOf(
  node: MockupNode,
  catalog: Catalog,
): BlockTypeDescriptor | undefined {
  if (node.type !== undefined) return catalog.byType.get(node.type);
  if (node.componentName === undefined) return undefined;
  return catalog.byComponent.get(normalizeComponentName(node.componentName));
}
