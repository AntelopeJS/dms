import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";

const JSON_INDENT = 2;
const CHECK_FLAG = "--check";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaPath = join(packageRoot, "data", "mockup-spec.schema.json");
const builderPath = join(packageRoot, "dist", "mockup", "json-schema.js");
const builderSchema = z.object({ buildMockupSchema: z.function() });

/**
 * The JSON Schema of a mockup spec over the built-in block types, built by
 * the module's own `buildMockupSchema` (the build's `dist`).
 * @returns {Promise<string>}
 */
async function readSchema() {
  if (!existsSync(builderPath)) {
    console.error(
      `${relative(process.cwd(), builderPath)} is missing: run \`pnpm --dir packages/dms build\` first`,
    );
    process.exit(1);
  }
  const { ListBlockTypes } =
    await import("@antelopejs/interface-dms/base/block-types");
  const builder = builderSchema.parse(
    await import(pathToFileURL(builderPath).href),
  );
  const schema = builder.buildMockupSchema(ListBlockTypes());
  return `${JSON.stringify(schema, null, JSON_INDENT)}\n`;
}

const expected = await readSchema();
const shown = relative(process.cwd(), schemaPath);
if (process.argv.includes(CHECK_FLAG)) {
  const current = existsSync(schemaPath)
    ? readFileSync(schemaPath, "utf8")
    : "";
  if (current !== expected) {
    console.error(
      `${shown} is stale: run \`pnpm --dir packages/dms mockup:schema\` and commit it`,
    );
    process.exit(1);
  }
} else {
  mkdirSync(dirname(schemaPath), { recursive: true });
  writeFileSync(schemaPath, expected);
}
