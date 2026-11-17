import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const require = createRequire(import.meta.url);

const LANDMARKS = new Set([
  "page/metadata",
  "page/internal/metadata-lifecycle",
  "page/internal/metadata-info",
  "page/internal/categories",
  "permissions",
  "page/internal/category-resolution",
  "page/internal/registry",
  "page/categories",
  "page/internal/metadata-publish",
  "tenant-access",
]);

/** The interface-dms modules in the order they first load when `entry` is required into a fresh module cache. */
function loadOrder(entry) {
  /** @type {string[]} */
  const loaded = [];
  const hooks = registerHooks({
    load: (url, context, nextLoad) => {
      if (url.startsWith("file:")) {
        const file = relative(dist, fileURLToPath(url)).split(sep).join("/");
        if (!file.startsWith("..")) loaded.push(file.replace(/\.js$/, ""));
      }
      return nextLoad(url, context);
    },
  });
  try {
    require(`../dist/${entry}.js`);
  } finally {
    hooks.deregister();
  }
  return loaded;
}

await test("page/metadata, loaded first as the DMS module loads it, evaluates permissions before the category proxies and the proxies before tenant-access", () => {
  const order = loadOrder("page/metadata").filter((file) =>
    LANDMARKS.has(file),
  );

  assert.deepEqual(order, [
    "page/metadata",
    "page/internal/metadata-lifecycle",
    "page/internal/metadata-info",
    "page/internal/categories",
    "permissions",
    "page/internal/category-resolution",
    "page/internal/registry",
    "page/categories",
    "page/internal/metadata-publish",
    "tenant-access",
  ]);
});
