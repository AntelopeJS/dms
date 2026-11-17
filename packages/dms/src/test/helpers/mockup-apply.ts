import {
  type ApplyPlan,
  convertPage,
  type DraftSummary,
  type MockupNode,
  type MockupSpecPage,
  mockupNameSchema,
  openOracle,
  planApply,
  summarize,
} from "../../mockup";
import { BOOK_RESOURCE, type BlockDraft, structureOf } from "./live-page";

const NAME = mockupNameSchema.parse("books");
const REF = "/books";

/** The plan of the live page `blocks`, converted, then edited by `edit`. */
export function planEdited(
  blocks: BlockDraft[],
  edit: (page: MockupSpecPage) => void = () => undefined,
): ApplyPlan & { summary: DraftSummary } {
  const structure = structureOf(REF, blocks);
  const oracle = openOracle(NAME, "books");
  const resources = new Map([[BOOK_RESOURCE.ref, BOOK_RESOURCE]]);
  const reconverted = convertPage(structure, "books", { oracle, resources });
  const page = structuredClone(reconverted.page);
  edit(page);
  const plan = planApply(page, structure, reconverted.page, {
    pointer: "/pages/0",
    oracle,
  });
  return { ...plan, summary: summarize(plan.draft, structure) };
}

/** The node reached from the page's top level through each id in turn. */
export function nodeAt(page: MockupSpecPage, ...ids: string[]): MockupNode {
  let nodes = page.tree;
  let found: MockupNode | undefined;
  for (const id of ids) {
    found = nodes.find((node) => node.id === id);
    if (!found) throw new Error(`no node ${ids.join("/")}`);
    nodes = found.children ?? [];
  }
  if (!found) throw new Error("no id given");
  return found;
}

function removeNode(nodes: MockupNode[], id: string): MockupNode | undefined {
  const index = nodes.findIndex((node) => node.id === id);
  if (index >= 0) return nodes.splice(index, 1)[0];
  for (const node of nodes) {
    const removed = node.children && removeNode(node.children, id);
    if (removed) return removed;
  }
  return undefined;
}

/** Takes the node `id` out of `nodes`, wherever it sits under them. */
export function takeNode(nodes: MockupNode[], id: string): MockupNode {
  const taken = removeNode(nodes, id);
  if (!taken) throw new Error(`no node ${id}`);
  return taken;
}
