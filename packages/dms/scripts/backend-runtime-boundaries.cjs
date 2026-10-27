const { registerHooks } = require("node:module");
const { fileURLToPath } = require("node:url");
const { join, resolve, sep } = require("node:path");
const { checkEdge } = require("./backend-import-target.cjs");

const root = resolve(__dirname, "..");
const boundaries = [join(root, "src") + sep, join(root, "dist") + sep];

registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (
      context.parentURL?.startsWith("file:") &&
      result.url.startsWith("file:")
    ) {
      const importer = fileURLToPath(context.parentURL);
      if (boundaries.some((boundary) => importer.startsWith(boundary))) {
        checkEdge(importer, fileURLToPath(result.url));
      }
    }
    return result;
  },
});
