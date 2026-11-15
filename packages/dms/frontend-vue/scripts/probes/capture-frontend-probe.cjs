"use strict";

const path = require("node:path");
const { createRequire } = require("node:module");
/** @type {(id: string) => typeof import("esbuild")} */
const loadEsbuild = createRequire(require.resolve("vite/package.json"));
const { buildSync } = loadEsbuild("esbuild");

/** @param {string} outfile */
function captureProbe(outfile) {
  buildSync({
    entryPoints: [path.join(__dirname, "frontend-behavior.cjs")],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    logLevel: "silent",
  });
}

module.exports = { captureProbe };

if (require.main === module) captureProbe(path.resolve(process.argv[2]));
