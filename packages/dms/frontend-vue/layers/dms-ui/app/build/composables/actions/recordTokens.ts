import { recordUrlKey } from "../table-view/utils/recordLink";
import type { TableUrlScope } from "../table-view/utils/views";

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

// Tenant-scoped ids ("default:<uuid>") reach a `/:id/...` route as they are,
// as a row token's value does (see `interpolateUrl`).
const ENCODED_COLON = /%3A/gi;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

function fillTokens(value: unknown, fill: (text: string) => string): unknown {
  if (typeof value === "string") return fill(value);
  if (Array.isArray(value)) return value.map((item) => fillTokens(item, fill));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, fillTokens(item, fill)]),
  );
}

/**
 * The options of a component a row action opens on a row (a drawer, a modal,
 * a side panel), with the `{{query.<record key>}}` tokens (`{{query.record}}`,
 * `{{query.<tableId>.record}}`) naming the row's id.
 *
 * The table writes the open row in the URL in place (`history.replaceState`),
 * which the page's route values do not follow: a component reading its row
 * from the URL — `ResourceForm(controller, { rowId: "{{query.record}}" })`, a
 * block's `fetchUrl: "/api/sites/{{query.record}}"` — would read the row
 * opened before, or none, until a reload. The row is known when the component
 * mounts, so its options name it. A token that is the whole value takes the id
 * as it is (`rowId`); inside a longer text it is percent-encoded, as any
 * `{{query.X}}` of a URL.
 */
export function withRecordTokens<T>(
  options: T,
  scope: TableUrlScope,
  id: string | undefined,
): T {
  if (id === undefined || options === undefined) return options;
  const key = escapeRegExp(recordUrlKey(scope));
  const token = new RegExp(String.raw`\{\{\s*query\.${key}\s*\}\}`, "g");
  const wholeToken = new RegExp(String.raw`^\s*${token.source}\s*$`);
  const encoded = encodeURIComponent(id).replace(ENCODED_COLON, ":");
  return fillTokens(options, (text) => {
    if (!text.includes("{{")) return text;
    if (wholeToken.test(text)) return id;
    return text.replace(token, encoded);
  }) as T;
}
