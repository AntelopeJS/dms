import path from "node:path";
import { expect } from "chai";

const TOOL_MODULES = [
  path.join(__dirname, "../../../mcp/tool.js"),
  path.join(__dirname, "../../../mcp/tools") + path.sep,
];

function forgetToolModules(): void {
  for (const key of Object.keys(require.cache)) {
    if (TOOL_MODULES.some((module) => key.startsWith(module))) {
      delete require.cache[key];
    }
  }
}

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

  it("builds every tool's schema without writing to the console, recursive inputs included", async () => {
    forgetToolModules();
    const { MCP_TOOLS } = await import("../../../mcp/tools");
    expect(MCP_TOOLS.length).to.be.greaterThan(0);
    expect(written).to.deep.equal([]);
  });
});
