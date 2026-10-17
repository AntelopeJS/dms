import {
  interpolateRowText,
  interpolateUrl,
  namesRowField,
} from "#dms-core/app/utils/url-interpolation";

type Options = Record<string, unknown>;

// An option holding a URL is named so (`fetchUrl`, `submitUrl`, `searchUrl`,
// `to`): it is filled encoded, as an action's URL is. Any other text
// (`rowId`, a title) takes the row's values as they are.
const URL_OPTION = /(?:url|^to|^href)$/i;

// Options naming rows of their own — a nested table's row actions, a source
// table's `fetchRowUrl` — keep their `{{row.X}}` for those rows.
const OWN_ROW_OPTIONS: ReadonlySet<string> = new Set([
  "rowActions",
  "fetchRowUrl",
]);

const isPlainObject = (value: unknown): value is Options =>
  Object.prototype.toString.call(value) === "[object Object]";

function fillValue(value: unknown, key: string, row: Options): unknown {
  if (OWN_ROW_OPTIONS.has(key)) return value;
  if (typeof value === "string") {
    if (!namesRowField(value)) return value;
    return URL_OPTION.test(key)
      ? interpolateUrl(value, row)
      : interpolateRowText(value, row);
  }
  if (Array.isArray(value))
    return value.map((item) => fillValue(item, key, row));
  if (isPlainObject(value)) return fillRowOptions(value, row);
  return value;
}

/**
 * The options a row's drawer, modal or side panel hands its component, with
 * the row's `{{row.X}}` tokens filled, nested options included: a block
 * declared on the backend (a `ResourceForm` reading `rowId: "{{row._id}}"`)
 * then reads the row the container shows. `row` carries `id`, the row's id
 * read through the table's `rowIdKey`. Filled anew for each row shown; a
 * nested table's row actions keep theirs for their own rows.
 */
export function fillRowOptions(options: Options, row: Options): Options {
  return Object.fromEntries(
    Object.entries(options).map(([key, value]) => [
      key,
      fillValue(value, key, row),
    ]),
  );
}
