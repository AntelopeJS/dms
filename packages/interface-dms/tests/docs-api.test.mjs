import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { ListBlockTypes } from "../dist/base/block-types.js";
import {
  docsApiExports,
  docsApiInSources,
} from "./helpers/docs-api-markers.mjs";

const sourceRoot = join(import.meta.dirname, "..", "src");

/** The authoring API outside the block factories and the data types. */
const AUTHORING_EXPORTS = ["ConfirmDialog", "CustomComponent"];

await test("docs-api: reads the marker on an export and the data types a decorator registers", () => {
  const { marked, dataTypes } = docsApiExports(`
    /** A block. @docsApi */
    export function Banner() {}
    /** Not marked. */
    export function Hidden() {}
    /** @docsApi */
    export const ChartLine = build();
    /** @docsApi */
    function local() {}
    @RegisterDataType("email")
    export class EmailType {}
  `);
  assert.deepEqual(marked, ["Banner", "ChartLine"]);
  assert.deepEqual(dataTypes, ["EmailType"]);
});

await test("docs-api: every block factory, ConfirmDialog, CustomComponent and data type carries the marker", () => {
  const { marked, dataTypes } = docsApiInSources(sourceRoot);
  const required = [
    ...ListBlockTypes().map(({ type }) => type),
    ...AUTHORING_EXPORTS,
    ...dataTypes,
  ];
  assert.deepEqual(
    required.filter((name) => !marked.has(name)),
    [],
  );
  assert.ok(dataTypes.size > 0);
});
