import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { MAX_RELATIVE_ROUTE } from "../../mockup";

/**
 * The paths `RELATIVE_ROUTE_PATTERN` accepts and refuses, which the
 * frontend's `isDashboardPath` test reads too.
 */
const TABLE_FILE = join(
  __dirname,
  "../../../frontend-vue/tests/fixtures/relative-routes.json",
);

const tableSchema = z.object({
  accepted: z.array(z.string()),
  refused: z.array(z.string()),
});

const table = tableSchema.parse(JSON.parse(readFileSync(TABLE_FILE, "utf8")));

/**
 * Paths of the site that a built page's link and a live route both accept.
 * The query and fragment ride along.
 */
export const ACCEPTED_ROUTES: readonly string[] = [
  ...table.accepted,
  `/${"a".repeat(MAX_RELATIVE_ROUTE - 1)}`,
];

/**
 * Live routes whose `{{ }}` tokens pad their key with spaces, as the
 * dashboard resolves them: a live route accepts them, a built page's link
 * refuses them.
 */
export const PADDED_TOKEN_ROUTES: readonly string[] = [
  "/api/customers/{{ params.id }}/stats",
  "/api/orders?store={{  query.store}}&page={{query.page }}",
  "/{{{ params.id }}}",
];

/**
 * Paths that a built page's link and a live route both refuse: no leading
 * `/`, a host behind `//` or `/\`, a scheme, whitespace, a control
 * character that a URL parser drops, a space outside a `{{ }}` token or
 * inside its key, or a path over the length limit. The run of tokens ending
 * in a space takes tens of seconds for a rule that backtracks over it, and
 * mocha reports the timeout.
 */
export const REFUSED_ROUTES: readonly string[] = [
  ...table.refused,
  `/${"a".repeat(MAX_RELATIVE_ROUTE)}`,
];
