import path from "node:path";
import { expect } from "chai";

const TS_MORPH_SEGMENT = `${path.sep}node_modules${path.sep}ts-morph${path.sep}`;

const tsMorphFilesAtStart = Object.keys(require.cache).filter((file) =>
  file.includes(TS_MORPH_SEGMENT),
);

describe("[integration] the modules an `mcp.enabled` start with the builder off loads, read as this file loads before any test runs, not those a later tool call loads", () => {
  it("loads no ts-morph", () => {
    expect(tsMorphFilesAtStart).to.deep.equal([]);
  });
});
