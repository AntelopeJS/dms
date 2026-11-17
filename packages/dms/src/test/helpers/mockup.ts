import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GetBlockType } from "@antelopejs/interface-dms/base/block-types";
import { z } from "zod";

/** `packages/dms`, from `dist/test/helpers`. */
const PACKAGE_ROOT = join(__dirname, "..", "..", "..");

/** The shipped `data/` directory: the example spec is the mockup `mockup-example`. */
export const MOCKUP_DATA_DIR = join(PACKAGE_ROOT, "data");

/** The name the example spec is read under, its directory in `data/`. */
export const EXAMPLE_MOCKUP = "mockup-example";

const docsExamplesSchema = z.record(
  z.object({ type: z.string() }).passthrough(),
);

/** How many pages one spec holds at most. */
const PAGES_PER_SPEC = 50;

/**
 * Specs with one page per docs example whose block needs no controller,
 * titled by the example's key, as many as the page limit takes. The docs
 * keep their frame `width` and the `factory` that built a tree on its root;
 * neither is part of a node.
 */
export function docsExamplesSpecTexts(): string[] {
  const examples = docsExamplesSchema.parse(
    JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "docs-data", "examples.json"), "utf8"),
    ),
  );
  const pages = Object.entries(examples)
    .filter(([, example]) => !GetBlockType(example.type)?.controllerArg)
    .map(([key, example], index) => {
      const { width: _width, factory: _factory, ...node } = example;
      return { id: `example-${index}`, title: key, tree: [node] };
    });
  const specs: string[] = [];
  for (let start = 0; start < pages.length; start += PAGES_PER_SPEC) {
    const chunk = pages.slice(start, start + PAGES_PER_SPEC);
    specs.push(JSON.stringify({ version: 1, pages: chunk }));
  }
  return specs;
}
