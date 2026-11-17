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
    expect(JSON.stringify(tool.inputSchema)).to.contain(
      '"$ref":"#/properties/root"',
    );
  });
});
