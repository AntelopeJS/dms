import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const SERIALIZER = fileURLToPath(
  new URL("./helpers/serialize-built-ins.mjs", import.meta.url),
);

/** Every built-in data type id but the relations, which need a data controller to serialize. */
const BUILT_IN_IDS = [
  "address",
  "array",
  "boolean",
  "code",
  "color",
  "date",
  "email",
  "file",
  "image",
  "key_value",
  "number",
  "password",
  "percentage",
  "phone",
  "price",
  "rich_text",
  "secret",
  "select",
  "status",
  "string",
  "string_time",
  "tags",
  "url",
];

/** The entries that serialize a column's data type, or hand `serializeType` to their importer. */
const SERIALIZING_ENTRIES = [
  "base/table-view",
  "base/table-view/meta",
  "base/table-view/source",
  "base/table-view/factory",
  "base/table-view/routes",
  "base/table-view/resource-form",
  "base/data-types/index",
  "base/index",
  "data-controllers/index",
  "data-controllers/members",
  "data-controllers/roles",
];

for (const entry of SERIALIZING_ENTRIES) {
  await test(`${entry}, loaded alone, registers every built-in data type serializeType reads`, async () => {
    const { stdout } = await promisify(execFile)(process.execPath, [
      SERIALIZER,
      entry,
    ]);

    assert.deepEqual(
      JSON.parse(stdout),
      Object.fromEntries(BUILT_IN_IDS.map((id) => [id, id])),
    );
  });
}
