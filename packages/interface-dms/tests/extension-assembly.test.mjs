import assert from "node:assert/strict";
import test from "node:test";
import { assembleLayoutComponents } from "../dist/page/internal/extension-assembly.js";

await test("an extension component keyed __proto__ is served as its own entry after the page's components", () => {
  const assembled = assembleLayoutComponents(
    { table: { componentName: "dms-table", options: {} } },
    [
      {
        key: "__proto__",
        side: "end",
        order: 0,
        extensionName: "demo",
        declarationIndex: 0,
        serialized: { componentName: "dms-banner", options: {} },
      },
    ],
  );
  assert.deepEqual(Object.keys(assembled), ["table", "__proto__"]);
  assert.equal(Object.getPrototypeOf(assembled), Object.prototype);
});

await test("without extensions the page's own components are served as they are, in order", () => {
  const own = {
    header: { componentName: "dms-header", options: {} },
    table: { componentName: "dms-table", options: {} },
  };
  const assembled = assembleLayoutComponents(own, []);
  assert.notEqual(assembled, own);
  assert.deepEqual(Object.keys(assembled), ["header", "table"]);
  assert.equal(assembled.table, own.table);
});
