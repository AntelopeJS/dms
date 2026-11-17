import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BlockTypeDescriptor } from "@antelopejs/interface-dms/base/block-types";
import { z } from "zod";
import { type JsonObject, jsonObjectSchema } from "../../mockup";

const FIXTURES = join(
  __dirname,
  "../../../frontend-vue/tests/fixtures/mockup-starters",
);

const CATALOG_FILE = join(FIXTURES, "catalog.json");
const NODES_FILE = join(FIXTURES, "nodes.json");

/** Set it to rewrite the catalog fixture from the registered block types. */
export const UPDATE_VARIABLE = "MOCKUP_STARTERS_UPDATE";

/**
 * The part of a descriptor the editor's Add tab reads to start a block: what
 * `newBlock` in the frontend's `mockupCatalog.ts` looks at, and no more.
 */
export function starterView(block: BlockTypeDescriptor): JsonObject {
  const config = Object.fromEntries(
    Object.entries(block.config)
      .filter(
        ([, option]) => !option.optional || option.ui?.initial !== undefined,
      )
      .map(([key, option]) => [
        key,
        {
          type: option.type,
          optional: option.optional,
          enum: option.enum,
          ui: {
            label: option.ui?.label,
            widget: option.ui?.widget,
            min: option.ui?.min,
            initial: option.ui?.initial,
            blockTypes: option.ui?.blockTypes,
          },
        },
      ]),
  );
  return jsonObjectSchema.parse(
    JSON.parse(
      JSON.stringify({
        type: block.type,
        componentName: block.componentName,
        meta: { name: block.meta.name },
        container: block.container,
        allowedChildren: block.allowedChildren,
        defaults: block.defaults,
        initialChildren: block.initialChildren,
        config,
      }),
    ),
  );
}

/** The starter views of `blocks`, in a stable order. */
export function starterViews(
  blocks: readonly BlockTypeDescriptor[],
): JsonObject[] {
  return [...blocks]
    .sort((left, right) => left.type.localeCompare(right.type))
    .map(starterView);
}

const catalogSchema = z.object({ blocks: z.array(jsonObjectSchema) });

/** The catalog the frontend started every block from when it wrote the nodes. */
export function readStarterCatalog(): JsonObject[] {
  return catalogSchema.parse(JSON.parse(readFileSync(CATALOG_FILE, "utf8")))
    .blocks;
}

/** Rewrites the catalog fixture from `blocks`. */
export function writeStarterCatalog(blocks: JsonObject[]): void {
  const lines = blocks.map((block) => JSON.stringify(block)).join(",\n");
  writeFileSync(CATALOG_FILE, `{"blocks":[\n${lines}\n]}\n`);
}

const startersSchema = z.record(
  z.object({ node: jsonObjectSchema, fixtures: jsonObjectSchema }),
);

/** What the Add tab starts each block type as: its node and the page fixtures it needs. */
export type StarterNodes = z.infer<typeof startersSchema>;

/** The nodes the frontend wrote for every block of the catalog fixture. */
export function readStarterNodes(): StarterNodes {
  return startersSchema.parse(JSON.parse(readFileSync(NODES_FILE, "utf8")));
}
