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
  ListPages,
  MoveBlock,
  RefreshSourceIndex,
  RemoveBlock,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { JsonObjectSchema } from "../json";
import { repeatConfirmation } from "../confirmation-gate";
import { defineTool, textResult } from "../tool";
import {
  BLOCK_PATH,
  BLOCK_PATH_FORMAT,
  containsExprSentinel,
  exprRefusal,
  withEscalationNote,
  opResult,
  PARENT_PATH,
  TARGET_MODULE,
} from "./builder-shared";

const listPages = defineTool({
  name: "builder_list_pages",
  title: "List Builder pages",
  description: withEscalationNote(
    "Lists all builder-editable pages (route, id, category, file).",
  ),
  effect: "read",
  input: z.object({}),
  run: async () => opResult(await ListPages()),
});

const pageStructure = defineTool({
  name: "builder_page_structure",
  title: "Builder page structure",
  description: withEscalationNote(
    `Returns a page's block tree (each block's path, type, editability, config) plus a version hash for optimistic concurrency. ${BLOCK_PATH_FORMAT}`,
  ),
  effect: "read",
  input: z.object({ pageRef: z.string() }),
  run: async ({ pageRef }) => opResult(await GetPageStructure(pageRef)),
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
    repeatConfirmation.hold(sessionId, "builder_delete_page", args) ??
    opResult(await DeletePage(args.pageRef)),
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
  run: async (input) =>
    containsExprSentinel.parse(input.config)
      ? exprRefusal()
      : opResult(await AddBlock(input)),
});

const configureBlock = defineTool({
  name: "builder_configure_block",
  title: "Configure block",
  description: withEscalationNote(
    "Merges (or replaces, with replace:true) options into a block's config. Children are managed with Add/Move/Remove, not here.",
  ),
  effect: "builder",
  input: z.object({
    path: BLOCK_PATH,
    patch: JsonObjectSchema,
    replace: z.boolean().optional(),
  }),
  run: async ({ path, patch, replace }) =>
    containsExprSentinel.parse(patch)
      ? exprRefusal()
      : opResult(await ConfigureBlock(path, patch, { replace })),
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
    "Creates a navigation category (optionally under a parent category).",
  ),
  effect: "builder",
  input: z.object({
    name: z.string(),
    displayName: z.string(),
    parent: z.string().optional(),
    icon: z.string().optional(),
    order: z.number().optional(),
    module: TARGET_MODULE,
  }),
  run: async (input) => opResult(await CreateCategory(input)),
});

const configureCategory = defineTool({
  name: "builder_configure_category",
  title: "Configure category",
  description: withEscalationNote(
    "Updates a category's metadata (displayName, icon, order).",
  ),
  effect: "builder",
  input: z.object({ ref: z.string(), patch: JsonObjectSchema }),
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
    repeatConfirmation.hold(sessionId, "builder_delete_category", args) ??
    opResult(await DeleteCategory(args.ref)),
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
