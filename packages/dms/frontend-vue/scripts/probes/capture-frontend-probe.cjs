"use strict";

const path = require("node:path");
const { createRequire } = require("node:module");
const viteRequire = createRequire(require.resolve("vite/package.json"));
const { buildSync } = viteRequire("esbuild");

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
