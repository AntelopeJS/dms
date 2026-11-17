import { z } from "zod";
import { listPreviewBlockTypes } from "../../pages/public/preview";
import { sketchRefusals } from "../../mockup/sketch";
import { JsonObjectSchema } from "../json";
import { defineTool, type McpToolResult, textResult } from "../tool";

const MAX_DEPTH = 8;
const MAX_NODES = 200;
const MAX_VARIANTS = 4;
const MAX_ROOTS = 12;
const MAX_TITLE_CHARS = 120;
const MAX_LABEL_CHARS = 60;
const MAX_DESCRIPTION_CHARS = 2_000;
const MAX_CAPTION_CHARS = 200;
const MAX_URL_CHARS = 2_048;
const BYTES_PER_KIBIBYTE = 1024;
const MAX_JSON_BYTES = 64 * BYTES_PER_KIBIBYTE;
const SKETCH_MIN_HEIGHT_PX = 80;
const SKETCH_DEFAULT_HEIGHT_PX = 320;
const SKETCH_MAX_HEIGHT_PX = 1_200;

const SAME_ORIGIN_PATH = /^\/(?![/\\])/;
const REMOTE_URL = /^https?:\/\//i;
const URL_OPTION_KEY = /(?:Url|^location)$/;
const OptionUrlSchema = z.string();

interface PreviewNode {
  type?: string;
  componentName?: string;
  options?: z.infer<typeof JsonObjectSchema>;
  id?: string;
  slot?: string;
  colSpan?: number;
  children?: PreviewNode[];
}

const PreviewNodeSchema: z.ZodType<PreviewNode> = z.lazy(() =>
  z.object({
    type: z
      .string()
      .optional()
      .describe("Block type from builder_catalog, e.g. `KpiCard`."),
    componentName: z
      .string()
      .optional()
      .describe(
        "Registered block component name, e.g. `dms-kpi-card`; only when `type` is unknown.",
      ),
    options: JsonObjectSchema.optional().describe(
      "The block's options, as its declaration takes them. A `fetchUrl` must be a same-origin path.",
    ),
    id: z.string().optional().describe("Child id, unique among its siblings."),
    slot: z
      .string()
      .optional()
      .describe(
        "Slot of the parent the child renders in, when it has several.",
      ),
    colSpan: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Columns a GridRow child spans."),
    children: z
      .array(PreviewNodeSchema)
      .optional()
      .describe("Nested blocks, in order."),
  }),
);

const PreviewTreeSchema = z
  .union([PreviewNodeSchema, z.array(PreviewNodeSchema).min(1).max(MAX_ROOTS)])
  .describe("One block, or a list of blocks stacked in order.");

const PreviewSketchSchema = z
  .object({
    html: z
      .string()
      .min(1)
      .max(MAX_JSON_BYTES)
      .describe(
        "Body markup of the component. Static only: no script, event handler, form or external resource; links only to #anchors, images only as data:image/ URLs.",
      ),
    css: z
      .string()
      .max(MAX_JSON_BYTES)
      .optional()
      .describe(
        "Styles for the markup. The `--sketch-*` variables (surface, text, border, accent, radius, font) follow the dashboard's light or dark theme.",
      ),
    caption: z
      .string()
      .max(MAX_CAPTION_CHARS)
      .optional()
      .describe(
        "One line on what the sketch shows, e.g. `Revenue card with a sparkline`.",
      ),
    height: z
      .number()
      .int()
      .min(SKETCH_MIN_HEIGHT_PX)
      .max(SKETCH_MAX_HEIGHT_PX)
      .optional()
      .describe(
        `Frame height in pixels; the sketch scrolls past it. Default ${SKETCH_DEFAULT_HEIGHT_PX}.`,
      ),
  })
  .describe(
    "A proposed custom component as static HTML and CSS, shown beside the DMS option and labelled as not a DMS block.",
  );

const PreviewVariantSchema = z.object({
  label: z
    .string()
    .min(1)
    .max(MAX_LABEL_CHARS)
    .describe("Tab label, e.g. `Compact` or `Custom sketch`."),
  tree: PreviewTreeSchema.optional(),
  sketch: PreviewSketchSchema.optional(),
});

const PreviewInputSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(MAX_TITLE_CHARS)
    .describe("Preview title, e.g. `Revenue card: DMS KpiCard`."),
  description: z
    .string()
    .max(MAX_DESCRIPTION_CHARS)
    .optional()
    .describe("What to look at: the visible differences from the mockup."),
  label: z
    .string()
    .min(1)
    .max(MAX_LABEL_CHARS)
    .optional()
    .describe(
      "Tab label of the main view when there are variants, e.g. `DMS KpiCard`.",
    ),
  tree: PreviewTreeSchema.optional(),
  sketch: PreviewSketchSchema.optional(),
  reference: z
    .object({
      url: z
        .string()
        .max(MAX_URL_CHARS)
        .optional()
        .describe(
          "Same-origin path of an image (e.g. a media URL). An external URL is only shown as a link.",
        ),
      caption: z
        .string()
        .max(MAX_CAPTION_CHARS)
        .optional()
        .describe("What the reference shows, e.g. `Your mockup`."),
    })
    .optional()
    .describe("The person's mockup to show side by side with the blocks."),
  variants: z
    .array(PreviewVariantSchema)
    .max(MAX_VARIANTS)
    .optional()
    .describe(
      "Alternatives shown as tabs after the main view, e.g. the same block with other options, or a custom `sketch`.",
    ),
});

type PreviewView = Pick<
  z.infer<typeof PreviewVariantSchema>,
  "tree" | "sketch"
>;

class PreviewInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface PreviewTally {
  nodes: number;
  blockTypes: Set<string>;
}

interface KnownBlocks {
  types: ReadonlySet<string>;
  componentNames: ReadonlyMap<string, string>;
}

function knownBlocks(): KnownBlocks {
  const entries = Object.entries(listPreviewBlockTypes());
  return {
    types: new Set(entries.map(([type]) => type)),
    componentNames: new Map(
      entries.map(([type, entry]) => [entry.componentName, type]),
    ),
  };
}

function blockTypeOf(node: PreviewNode, known: KnownBlocks): string {
  if (node.type !== undefined && known.types.has(node.type)) return node.type;
  const byComponent =
    node.componentName === undefined
      ? undefined
      : known.componentNames.get(node.componentName);
  if (byComponent !== undefined) return byComponent;
  if (node.type === undefined && node.componentName === undefined) {
    throw new PreviewInputError(
      "invalid_tree",
      "Every node needs a `type` (a block type from builder_catalog) or a `componentName`.",
    );
  }
  throw new PreviewInputError(
    "unknown_block_type",
    `${node.type ?? node.componentName} is not a block type the DMS registers. Registered types: ${[...known.types].join(", ")}`,
  );
}

function checkOptionUrls(node: PreviewNode): void {
  const offending = Object.entries(node.options ?? {}).find(([key, value]) => {
    if (!URL_OPTION_KEY.test(key)) return false;
    const url = OptionUrlSchema.safeParse(value);
    return url.success && !SAME_ORIGIN_PATH.test(url.data);
  });
  if (offending === undefined) return;
  throw new PreviewInputError(
    "invalid_tree",
    `Options ending in \`Url\` (and \`location\`) must be same-origin paths such as \`/api/orders\`, or the preview refuses the block. Offending option: ${offending[0]}`,
  );
}

function checkNode(
  node: PreviewNode,
  depth: number,
  known: KnownBlocks,
  tally: PreviewTally,
): void {
  if (depth > MAX_DEPTH) {
    throw new PreviewInputError(
      "invalid_tree",
      `The tree is nested deeper than ${MAX_DEPTH} levels.`,
    );
  }
  tally.blockTypes.add(blockTypeOf(node, known));
  checkOptionUrls(node);
  tally.nodes += 1;
  if (tally.nodes > MAX_NODES) {
    throw new PreviewInputError(
      "too_large",
      `The preview has more than ${MAX_NODES} nodes in all; show a smaller part of the page.`,
    );
  }
  for (const child of node.children ?? []) {
    checkNode(child, depth + 1, known, tally);
  }
}

function checkSketch(sketch: { html: string; css?: string }): void {
  const refused = sketchRefusals(sketch);
  if (refused.length === 0) return;
  throw new PreviewInputError(
    "invalid_sketch",
    `A sketch is static HTML and CSS on the sketch allowlist: inline images as data:image/ URLs, link only to #anchors, and use no script, event handler, form, external resource or embedded frame. Refused: ${refused.join("; ")}.`,
  );
}

function checkViews(views: PreviewView[]): PreviewTally {
  const known = knownBlocks();
  const tally: PreviewTally = { nodes: 0, blockTypes: new Set() };
  for (const { tree, sketch } of views) {
    if (tree === undefined && sketch === undefined) {
      throw new PreviewInputError(
        "invalid_tree",
        "Every view (the preview and each variant) needs a `tree`, a `sketch`, or both.",
      );
    }
    const roots = tree === undefined ? [] : [tree].flat();
    for (const root of roots) checkNode(root, 1, known, tally);
    if (sketch !== undefined) checkSketch(sketch);
  }
  const content = views.map(({ tree, sketch }) => ({ tree, sketch }));
  if (Buffer.byteLength(JSON.stringify(content)) > MAX_JSON_BYTES) {
    throw new PreviewInputError(
      "too_large",
      `The preview's trees and sketches are larger than ${MAX_JSON_BYTES} bytes of JSON; show a smaller part of the page.`,
    );
  }
  return tally;
}

function checkReferenceUrl(url: string | undefined): void {
  if (url === undefined || SAME_ORIGIN_PATH.test(url) || REMOTE_URL.test(url)) {
    return;
  }
  throw new PreviewInputError(
    "invalid_url",
    "`reference.url` must be a same-origin path (`/media/...`) or an http(s) URL.",
  );
}

function validated(input: z.infer<typeof PreviewInputSchema>): McpToolResult {
  const views = [input, ...(input.variants ?? [])];
  checkReferenceUrl(input.reference?.url);
  const tally = checkViews(views);
  return textResult(
    JSON.stringify({
      ok: true,
      data: {
        views: views.length,
        sketches: views.filter(({ sketch }) => sketch !== undefined).length,
        nodes: tally.nodes,
        blockTypes: [...tally.blockTypes].sort(),
      },
      message:
        "The preview is valid: every block type is registered and it fits the preview's limits. Nothing was rendered or changed.",
    }),
  );
}

export const previewBlocksTool = defineTool({
  name: "preview_blocks",
  title: "Preview blocks",
  description:
    "Checks a preview of DMS blocks before you build it: a block tree, each node a registered block `type` from builder_catalog (or its `componentName`) with its options and children, beside the person's mockup when you pass it as `reference`, with one tab per variant. A view may carry a `sketch` instead of (or beside) its `tree`: static HTML and CSS of a custom component you propose, labelled as not a DMS block, checked as the mockup compiler checks a sketch: parsed as HTML, every element and attribute on the sketch allowlist, URLs only #anchors and data:image/ URLs. It validates every node against the block types the DMS registers and the preview's limits " +
    `(${MAX_DEPTH} levels, ${MAX_NODES} nodes, ${MAX_VARIANTS} variants, ${MAX_JSON_BYTES / BYTES_PER_KIBIBYTE} KiB)` +
    ", and answers what it validated: the views, the node count and the block types used. It renders nothing and changes nothing in the project.",
  effect: "read",
  input: PreviewInputSchema,
  async run(input) {
    try {
      return validated(input);
    } catch (error) {
      if (!(error instanceof PreviewInputError)) throw error;
      return textResult(
        JSON.stringify({
          ok: false,
          error: { code: error.code },
          message: error.message,
        }),
        true,
      );
    }
  },
});
