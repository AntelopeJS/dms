import { expect } from "chai";
import { z } from "zod";
import { defineTool, textResult } from "../../../mcp/tool";

interface TreeNode {
  type: string;
  children?: TreeNode[];
  config?: Record<string, string>;
}

const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    children: z.array(TreeNodeSchema).optional(),
    config: z.record(z.string(), z.string()).optional(),
  }),
);

const RefSchema = z.object({ $ref: z.string() });

/** A tree's input schema: its root a `$ref` to a definition whose children refer back to it. */
const RecursiveInputSchema = z.object({
  properties: z.object({ root: RefSchema }),
  definitions: z.record(
    z.string(),
    z.object({
      properties: z.object({ children: z.object({ items: RefSchema }) }),
    }),
  ),
});

describe("[unit] mcp tool schemas", () => {
  const { warn, error } = console;
  const written: unknown[][] = [];

  beforeEach(() => {
    written.length = 0;
    console.warn = (...args: unknown[]) => {
      written.push(args);
    };
    console.error = (...args: unknown[]) => {
      written.push(args);
    };
  });

  afterEach(() => {
    console.warn = warn;
    console.error = error;
  });

  it("builds the schema of a recursive input without writing to the console, and keeps the recursion as a ref", () => {
    const tool = defineTool({
      name: "tree",
      title: "Tree",
      description: "Takes a tree.",
      effect: "read",
      input: z.object({ root: TreeNodeSchema }),
      run: async () => textResult("ok"),
    });
    expect(written).to.deep.equal([]);
    const { properties, definitions } = RecursiveInputSchema.parse(
      tool.inputSchema,
    );
    const node =
      definitions[properties.root.$ref.replace("#/definitions/", "")];
    expect(node?.properties.children.items.$ref).to.equal(properties.root.$ref);
  });
});
