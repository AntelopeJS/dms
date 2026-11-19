import { z } from "zod";
import {
  jsonPointer,
  type MockupIssue,
  type MockupNode,
  type MockupSpec,
} from "./model";
import { pageLinkTarget } from "./page-links";

const TABLE_TYPE = "TableView";
const RESOURCE_FORM_TYPE = "ResourceForm";

/** A page a table opens on one of its rows: its details or its edit form. */
type RowPage = "details" | "edit";

/** The `ResourceForm` mode that shows a row read-only. */
const VIEW_MODE = "view";

/**
 * Whether a `ResourceForm` on each row page is in `view` mode, and what to
 * do about one that is not as it should be: the real `TableView` draws a
 * row's details read-only, and its edit form open to changes.
 */
const ROW_PAGE_MODES: Record<RowPage, { inView: boolean; advice: string }> = {
  details: {
    inView: true,
    advice:
      'set mode to "view", so the form is drawn read-only, as the table\'s own details are',
  },
  edit: {
    inView: false,
    advice: 'set mode to "edit", so its fields can be changed',
  },
};

const rowPageSchema = z.object({ urlSlug: z.string() }).passthrough();

/** The part of a table's `formContainer` that names its row pages. */
const pageContainerSchema = z
  .object({
    type: z.literal("page"),
    pages: z
      .object({
        details: rowPageSchema.optional(),
        edit: rowPageSchema.optional(),
      })
      .passthrough(),
  })
  .passthrough();

/** A node of the spec, the id of its page, and its JSON pointer path. */
export interface SpecNode {
  node: MockupNode;
  page: string;
  path: ReadonlyArray<string | number>;
}

/** `node` and every node under it, each with its page and its JSON pointer path. */
export function nodesUnder(
  node: MockupNode,
  page: string,
  path: ReadonlyArray<string | number>,
): SpecNode[] {
  return [
    { node, page, path },
    ...(node.children ?? []).flatMap((child, index) =>
      nodesUnder(child, page, [...path, "children", index]),
    ),
  ];
}

/** A page a table opens on a row, and the pointer of that table. */
interface RowPageOf {
  kind: RowPage;
  table: string;
}

function rowPagesOf({ node, path }: SpecNode): Array<[string, RowPageOf]> {
  if (node.type !== TABLE_TYPE) return [];
  const container = pageContainerSchema.safeParse(node.options?.formContainer);
  if (!container.success) return [];
  const table = jsonPointer(path);
  return (["details", "edit"] as const).flatMap((kind) => {
    const target = pageLinkTarget(container.data.pages[kind]?.urlSlug);
    return target === undefined ? [] : [[target, { kind, table }]];
  });
}

/**
 * The `ResourceForm`s of a table's row pages in the wrong mode, each at its
 * `options/mode`: on a details page, one not in `view` mode draws an
 * editable form where the table shows a row read-only; on an edit page, one
 * in `view` mode cannot change the row.
 */
export function formPageModeIssues(spec: MockupSpec): MockupIssue[] {
  const nodes = spec.pages.flatMap((page, index) =>
    page.tree.flatMap((node, at) =>
      nodesUnder(node, page.id, ["pages", index, "tree", at]),
    ),
  );
  const rowPages = new Map<string, RowPageOf[]>();
  for (const [page, rowPage] of nodes.flatMap(rowPagesOf)) {
    rowPages.set(page, [...(rowPages.get(page) ?? []), rowPage]);
  }
  return nodes.flatMap(({ node, page, path }) =>
    node.type !== RESOURCE_FORM_TYPE
      ? []
      : (rowPages.get(page) ?? [])
          .filter(
            ({ kind }) =>
              ROW_PAGE_MODES[kind].inView !==
              (node.options?.mode === VIEW_MODE),
          )
          .map(({ kind, table }) => ({
            path: jsonPointer([...path, "options", "mode"]),
            message: `this page is the ${kind} page of the table at ${table}: ${ROW_PAGE_MODES[kind].advice}`,
          })),
  );
}
