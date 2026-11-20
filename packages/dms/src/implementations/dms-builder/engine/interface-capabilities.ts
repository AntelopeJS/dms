import fs from "node:fs";
import path from "node:path";

const QUERY_RESPONSE_TYPES = path.join(
  "node_modules",
  "@antelopejs",
  "interface-dms",
  "dist",
  "base",
  "query-response.d.ts",
);
const BUCKET_OPTION = /\bbucket\?:/;
const WEEK_BUCKET = /["']week["']/;

/**
 * The declaration of the response helpers in the `@antelopejs/interface-dms` a file is
 * compiled against, or `undefined` when none is installed above it.
 */
function queryResponseTypes(fromFile: string): string | undefined {
  let current = path.dirname(fromFile);
  for (;;) {
    const declaration = path.join(current, QUERY_RESPONSE_TYPES);
    if (fs.existsSync(declaration)) {
      return fs.readFileSync(declaration, "utf8");
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

/**
 * Whether the `@antelopejs/interface-dms` a file is compiled against takes a `bucket` in a
 * series helper's options, which names each period for a reader. An older interface does not
 * declare it, and a route passing it would fail to typecheck, so the option is only written
 * where the types are found to carry it.
 *
 * A week is newer than the other periods: asked for one, the types must also list it.
 */
export function interfaceNamesBuckets(
  fromFile: string,
  period?: string,
): boolean {
  const types = queryResponseTypes(fromFile);
  return (
    types !== undefined &&
    BUCKET_OPTION.test(types) &&
    (period !== "week" || WEEK_BUCKET.test(types))
  );
}

/**
 * Whether the `@antelopejs/interface-dms` a file is compiled against exports a response
 * helper by that name. An older interface lacks the newer ones, such as `percentOf` and
 * `kpiValueData`, and code importing them would fail to typecheck.
 */
export function interfaceExportsHelper(
  fromFile: string,
  helper: string,
): boolean {
  const types = queryResponseTypes(fromFile);
  return (
    types !== undefined && new RegExp(`\\bfunction\\s+${helper}\\b`).test(types)
  );
}
