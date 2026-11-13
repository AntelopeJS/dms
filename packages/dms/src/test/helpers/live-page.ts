import type {
  BlockNode,
  ConfigObject,
  OpResult,
  PageStructure,
  ResourceStructure,
} from "@antelopejs/interface-dms-builder";
import type { LivePages, MockupNode } from "../../mockup";

/** A block as a test writes it: its path is derived from where it sits. */
export interface BlockDraft {
  name: string;
  type: string | null;
  config?: ConfigObject;
  lockedOptions?: Record<string, string>;
  editable?: boolean;
  controller?: string;
  slot?: string;
  meta?: ConfigObject;
  children?: BlockDraft[];
}

function placedBlock(draft: BlockDraft, path: string): BlockNode {
  const { children, editable, ...rest } = draft;
  const node: BlockNode = {
    ...rest,
    path,
    editable: editable ?? true,
    config: editable === false ? undefined : (draft.config ?? {}),
  };
  if (children) {
    node.children = children.map((child) =>
      placedBlock(child, `${path}/${child.name}`),
    );
  }
  return node;
}

export function structureOf(
  ref: string,
  blocks: BlockDraft[],
  version = "0123456789abcdef",
): PageStructure {
  return {
    page: {
      ref,
      id: ref.replace(/\W+/g, "-"),
      displayName: `Page ${ref}`,
      category: "test",
      filepath: `/project/src${ref}.ts`,
    },
    blocks: blocks.map((draft) => placedBlock(draft, `${ref}#${draft.name}`)),
    queries: [],
    version,
  };
}

export const BOOK_RESOURCE: ResourceStructure = {
  ref: "book",
  className: "Book",
  tableName: "books",
  route: "/api/book",
  schema: "core",
  files: { database: "db.ts", dataApi: "data-api.ts", index: "index.ts" },
  fields: [
    {
      name: "title",
      label: "Title",
      dataType: { $dataType: "string" },
      sortable: true,
    },
    { name: "price", dataType: { $dataType: "number" } },
    { name: "internal", dataType: { $dataType: "string" }, listable: false },
    { name: "legacy", opaque: true, opaqueReason: "hand-edited" },
  ],
  version: "r1",
};

export interface StubPages extends LivePages {
  structures: Map<string, PageStructure>;
  reads: string[];
}

function found<Data>(data: Data): OpResult<Data> {
  return { ok: true, data, changes: [] };
}

export function stubPages(
  structures: PageStructure[],
  resources: ResourceStructure[] = [BOOK_RESOURCE],
): StubPages {
  const byRef = new Map(structures.map((s) => [s.page.ref, s]));
  const reads: string[] = [];
  return {
    structures: byRef,
    reads,
    listPages: () => {
      reads.push("listPages");
      return Promise.resolve(
        [...byRef.values()].map(({ page }) => ({
          ref: page.ref,
          id: page.id,
          displayName: page.displayName,
          category: page.category,
          filepath: page.filepath,
        })),
      );
    },
    pageStructure: (ref) => {
      reads.push(`page ${ref}`);
      const structure = byRef.get(ref);
      return Promise.resolve(
        structure
          ? found(structure)
          : { ok: false, error: { code: "not_found", ref } },
      );
    },
    resourceStructure: (ref) => {
      reads.push(`resource ${ref}`);
      const resource = resources.find((entry) => entry.ref === ref);
      return Promise.resolve(
        resource
          ? found(resource)
          : { ok: false, error: { code: "not_found", ref } },
      );
    },
  };
}

function subtree(block: BlockNode): string[] {
  return [block.path, ...(block.children ?? []).flatMap(subtree)];
}

/**
 * The builder paths of `blocks` that no node of `nodes` stands for, matched
 * by name among siblings. A sketch stands for its block's whole subtree.
 */
export function unmappedPaths(
  blocks: readonly BlockNode[],
  nodes: readonly MockupNode[],
): string[] {
  return blocks.flatMap((block) => {
    const node = nodes.find((candidate) => candidate.id === block.name);
    if (!node) return subtree(block);
    if (node.type === "sketch") return [];
    return unmappedPaths(block.children ?? [], node.children ?? []);
  });
}
