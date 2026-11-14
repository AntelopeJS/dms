import path from "node:path";
import { expect } from "chai";

const TS_MORPH_DIR = path.dirname(require.resolve("ts-morph/package.json"));

const tsMorphFilesAtStart = Object.keys(require.cache).filter((file) =>
  file.startsWith(TS_MORPH_DIR + path.sep),
);

/**
 * The harness starts the DMS with `mcp.enabled` and the builder off. This file loads before any
 * test runs, so it sees the modules the start loaded, not those a later tool call loads.
 */
describe("[integration] mcp start with the builder off", () => {
  it("loads no ts-morph", () => {
    expect(tsMorphFilesAtStart).to.deep.equal([]);
  });
});
