import {
  AddBlock,
  ConfigureBlock,
  ConfigureCategory,
  ConfigurePage,
  CreateCategory,
  CreatePage,
  DeleteCategory,
  DeletePage,
  GetPageStructure,
  ListCategories,
  ListPages,
  MoveBlock,
  RefreshSourceIndex,
  RemoveBlock,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { hiddenOptionsOf } from "../hidden-values";
import { type JsonObject, JsonObjectSchema } from "../json";
import { repeatConfirmation } from "../confirmation-gate";
import { defineTool, jsonResult, textResult } from "../tool";
import {
  BLOCK_PATH,
  BLOCK_PATH_FORMAT,
  containsExprSentinel,
  exprRefusal,
  shownStructures,
  withEscalationNote,
  opResult,
  PARENT_PATH,
  refusalResult,
  TARGET_MODULE,
} from "./builder-shared";

const listPages = defineTool({
  name: "builder_list_pages",
  title: "List Builder pages",
  description: withEscalationNote(
    "Answers { pages, categories }. `pages`: every builder-editable page with its route (`ref`), id, category, file and `section`, the ref of the sidebar section it shows under. `categories`: every category with its ref, parent, title, icon and order; a sidebar section (a header over its pages, such as the built-in Pages, ref `pages`) has `section: true`, any other category folds its pages away under its entry.",
  ),
  effect: "read",
  input: z.object({}),
  run: async () =>
    textResult(
      JSON.stringify({
        pages: await ListPages(),
        categories: await ListCategories(),
      }),
    ),
});

const pageStructure = defineTool({
  name: "builder_page_structure",
  title: "Builder page structure",
  description: withEscalationNote(
    `Returns a page's block tree (each block's path, type, editability, config) plus a version hash for optimistic concurrency. ${BLOCK_PATH_FORMAT} A mapped TableView reads its tabs from a column (\`tabsFrom: { column }\`), which the DMS reads from the rows when it serves the page. A TableView's \`tabs\`, a select's \`items\` and a price's \`currency\` that a mapping from a connected database wrote before that read \`{ $hidden: n }\`, n the values it read from rows: leave that key out of a patch to keep it. The ones you wrote read as written.`,
  ),
  effect: "read",
  input: z.object({ pageRef: z.string() }),
  async run({ pageRef }) {
    const answer = await GetPageStructure(pageRef);
    if (!answer.ok) return opResult(answer);
    const { shownPageStructure } = await shownStructures();
    return opResult({ ...answer, data: shownPageStructure(answer.data) });
  },
});

const createPage = defineTool({
  name: "builder_create_page",
  title: "Create page",
  description: withEscalationNote(
    "Creates a new page under an existing category and wires it into the barrel so it registers.",
  ),
  effect: "builder",
  input: z.object({
    name: z.string(),
    displayName: z.string(),
    category: z.string(),
    icon: z
      .string()
      .optional()
      .describe("An icon name such as `i-ph-chart-line`."),
    order: z
      .number()
      .optional()
      .describe(
        "Sorts the page among its category's pages, lowest first, then by title. Pages the Connect mapping writes take 100, so a dashboard takes 0 to come first in the menu.",
      ),
    description: z
      .string()
      .optional()
      .describe("What the page is for, in a sentence."),
    module: TARGET_MODULE,
  }),
  run: async (input) => opResult(await CreatePage(input)),
});

const configurePage = defineTool({
  name: "builder_configure_page",
  title: "Configure page",
  description: withEscalationNote(
    "Updates a page's metadata: displayName, icon, order (lowest first, then by title; a dashboard takes 0, mapped table pages 100), description. Works on pages builder_map_resources wrote too.",
  ),
  effect: "builder",
  input: z.object({ pageRef: z.string(), patch: JsonObjectSchema }),
  run: async ({ pageRef, patch }) =>
    containsExprSentinel.parse(patch)
      ? exprRefusal()
      : opResult(await ConfigurePage(pageRef, patch)),
});

const deletePage = defineTool({
  name: "builder_delete_page",
  title: "Delete page",
  description: withEscalationNote(
    "Deletes a page file and removes its barrel import.",
  ),
  effect: "builder",
  input: z.object({ pageRef: z.string() }),
  run: async (args, sessionId) =>
    repeatConfirmation.run(sessionId, "builder_delete_page", args, async () =>
      opResult(await DeletePage(args.pageRef)),
    ),
});

const addBlock = defineTool({
  name: "builder_add_block",
  title: "Add block",
  description: withEscalationNote(
    "Adds a block. Omit `parent` for a top-level block, or pass a container block's path to nest. `type` and `config` must match the catalog. Block types the catalog marks `controllerArg: true` (e.g. `TableView`) bind to a data resource: pass `controller` = the resource `ref` from builder_list_resources (its DataAPI class becomes the block's leading argument) and put the display options in `config`.",
  ),
  effect: "builder",
  input: z.object({
    page: z.string(),
    parent: PARENT_PATH.optional(),
    slot: z.string().optional(),
    index: z.number().optional(),
    name: z.string(),
    type: z.string(),
    config: JsonObjectSchema,
    controller: z
      .string()
      .optional()
      .describe(
        "Resource ref (from builder_list_resources) for a controller-leading block such as TableView. Required for those types; rejected for others.",
      ),
  }),
  async run(input) {
    if (containsExprSentinel.parse(input.config)) return exprRefusal();
    const { isBlockName } =
      await import("../../implementations/dms-builder/engine");
    if (!isBlockName(input.name)) return nameRefusal(input.name);
    return opResult(await AddBlock(input, { agent: true }));
  },
});

/** The options a `replace` of a mapped page's block would drop unseen: those it holds hidden. */
async function droppedHiddenOptions(
  path: string,
  patch: JsonObject,
): Promise<string[]> {
  const hash = path.indexOf("#");
  if (hash < 0) return [];
  const structure = await GetPageStructure(path.slice(0, hash));
  if (!structure.ok) return [];
  const { shownPageStructure } = await shownStructures();
  const segments = path
    .slice(hash + 1)
    .split("/")
    .filter((segment) => segment.length > 0);
  return hiddenOptionsOf(shownPageStructure(structure.data), segments).filter(
    (key) => !Object.hasOwn(patch, key),
  );
}

/** The refusal of a block name a block path could not tell apart from a path, as builder_compose_page refuses it. */
function nameRefusal(name: string) {
  return jsonResult(
    {
      ok: false,
      error: {
        code: "invalid_config",
        issues: [
          {
            pointer: "/name",
            message: `"${name}" is not a valid block name; expected an identifier`,
          },
        ],
      },
    },
    true,
  );
}

const configureBlock = defineTool({
  name: "builder_configure_block",
  title: "Configure block",
  description: withEscalationNote(
    "Merges (or replaces, with replace:true) options into a block's config. Children are managed with Add/Move/Remove, not here. replace:true is refused while it would drop an option builder_page_structure shows as `{ $hidden: n }`: merge instead, or send that option yourself.",
  ),
  effect: "builder",
  input: z.object({
    path: BLOCK_PATH,
    patch: JsonObjectSchema,
    replace: z.boolean().optional(),
  }),
  async run({ path, patch, replace }) {
    if (containsExprSentinel.parse(patch)) return exprRefusal();
    const dropped =
      replace === true ? await droppedHiddenOptions(path, patch) : [];
    if (dropped.length > 0) {
      return refusalResult(
        "unsupported",
        `replace:true would drop ${dropped.join(", ")}, which builder_page_structure hides because a mapping wrote them from rows. Merge the patch without replace to keep them, or send them yourself.`,
      );
    }
    return opResult(
      await ConfigureBlock(path, patch, { replace, agent: true }),
    );
  },
});

const moveBlock = defineTool({
  name: "builder_move_block",
  title: "Move block",
  description: withEscalationNote(
    "Moves a child block to a new position within a container.",
  ),
  effect: "builder",
  input: z.object({
    path: BLOCK_PATH,
    parent: PARENT_PATH,
    slot: z.string().optional(),
    index: z.number(),
  }),
  run: async ({ path, parent, slot, index }) =>
    opResult(await MoveBlock(path, { parent, slot, index })),
});

const removeBlock = defineTool({
  name: "builder_remove_block",
  title: "Remove block",
  description: withEscalationNote("Removes a block and its whole subtree."),
  effect: "builder",
  input: z.object({ path: BLOCK_PATH }),
  run: async ({ path }) => opResult(await RemoveBlock(path)),
});

const createCategory = defineTool({
  name: "builder_create_category",
  title: "Create category",
  description: withEscalationNote(
    "Creates a navigation category under a parent category (Pages, ref `pages`, by default), which folds its pages away under its entry. With `section: true` it creates a sidebar section instead: a header at the top of the sidebar, beside Pages, listing its pages, as a mockup's `categories` draw. Answers its `ref`: `<parent>.<name>` for a category, `<name>` for a section. Create pages in either by passing that ref as their `category`.",
  ),
  effect: "builder",
  input: z.object({
    name: z.string(),
    displayName: z.string(),
    parent: z
      .string()
      .optional()
      .describe("The parent category's ref; a section takes none."),
    icon: z.string().optional(),
    order: z
      .number()
      .optional()
      .describe(
        "Sorts it among its siblings, lowest first. A section sits among Pages (1), Modules (2) and Settings (3).",
      ),
    module: TARGET_MODULE,
    section: z
      .boolean()
      .optional()
      .describe(
        "Writes a sidebar section (RootCategory) at the top of the sidebar instead of a category folded under a parent.",
      ),
  }),
  run: async (input) => opResult(await CreateCategory(input)),
});

const configureCategory = defineTool({
  name: "builder_configure_category",
  title: "Configure category",
  description: withEscalationNote(
    "Updates a category's metadata (displayName, icon, order). `section: true` turns a category directly under Pages into a sidebar section and `section: false` a section into a category under Pages: its pages and routes stay, its ref changes, and the answer's `ref` is the new one.",
  ),
  effect: "builder",
  input: z.object({
    ref: z.string(),
    patch: JsonObjectSchema.and(
      z.object({
        section: z
          .boolean()
          .optional()
          .describe(
            "true makes a category under Pages a sidebar section; false makes a section a category under Pages.",
          ),
      }),
    ),
  }),
  run: async ({ ref, patch }) =>
    containsExprSentinel.parse(patch)
      ? exprRefusal()
      : opResult(await ConfigureCategory(ref, patch)),
});

const deleteCategory = defineTool({
  name: "builder_delete_category",
  title: "Delete category",
  description: withEscalationNote(
    "Deletes a category. Refused with referential_integrity if any page still references it.",
  ),
  effect: "builder",
  input: z.object({ ref: z.string() }),
  run: async (args, sessionId) =>
    repeatConfirmation.run(
      sessionId,
      "builder_delete_category",
      args,
      async () => opResult(await DeleteCategory(args.ref)),
    ),
});

const refresh = defineTool({
  name: "builder_refresh",
  title: "Refresh the Builder",
  description: withEscalationNote(
    "Reconciles the builder's source index with disk after out-of-band edits (e.g. a Code mode excursion).",
  ),
  effect: "read",
  input: z.object({ pageRef: z.string().optional() }),
  async run({ pageRef }) {
    await RefreshSourceIndex(
      pageRef === undefined ? undefined : { page: pageRef },
    );
    return textResult(JSON.stringify({ ok: true }));
  },
});

export const BUILDER_PAGE_TOOLS = [
  listPages,
  pageStructure,
  createPage,
  configurePage,
  deletePage,
  addBlock,
  configureBlock,
  moveBlock,
  removeBlock,
  createCategory,
  configureCategory,
  deleteCategory,
  refresh,
];
