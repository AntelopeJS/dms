import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MISSING_FILE, parseFsError, SPEC_FILE } from "./files";
import type { JsonObject } from "./model";
import { jsonObjectSchema } from "./model";

/** The shipped example mockup, under the package's `data/`. */
const EXAMPLE_SPEC = join(
  __dirname,
  "..",
  "..",
  "data",
  "mockup-example",
  SPEC_FILE,
);

/**
 * The spec of the example mockup the package ships, as written; undefined
 * when the installed package holds no `data/mockup-example`.
 */
export async function readExampleSpec(): Promise<JsonObject | undefined> {
  try {
    return jsonObjectSchema.parse(
      JSON.parse(await readFile(EXAMPLE_SPEC, "utf8")),
    );
  } catch (error) {
    if (parseFsError(error).code === MISSING_FILE) return undefined;
    throw error;
  }
}
