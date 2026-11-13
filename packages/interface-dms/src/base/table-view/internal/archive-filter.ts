import type { RequestContext } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import type {
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";

const HTTP_BAD_REQUEST = 400;

const ARCHIVED_BY_TEXT = new Map([
  ["true", true],
  ["false", false],
]);

/**
 * The filter `@ArchiveField` registers. A list filter carries its value as
 * text, so this reads `true` or `false` as the boolean the field stores, then
 * compares with `eq` or `ne`.
 *
 * @throws HTTPResult 400 when the value is not `true` or `false`, or the mode
 * is not `eq` or `ne`
 * @internal
 */
export function filterArchiveField(
  _context: RequestContext,
  proxy: ValueProxy<unknown>,
  _key: string,
  value: string,
  mode: string,
): ValueProxyOrValue<boolean> {
  const archived = ARCHIVED_BY_TEXT.get(value);
  assert(
    archived !== undefined,
    HTTP_BAD_REQUEST,
    `Filter the archive field with true or false, not "${value}".`,
  );
  assert(
    mode === "eq" || mode === "ne",
    HTTP_BAD_REQUEST,
    `Filter the archive field with eq or ne, not "${mode}".`,
  );
  return mode === "eq" ? proxy.eq(archived) : proxy.ne(archived);
}
