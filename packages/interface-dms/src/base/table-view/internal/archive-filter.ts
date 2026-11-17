import type {
  ControllerClass,
  RequestContext,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import type {
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";
import { isBoolean } from "../../../utils/internal/type-check";

const HTTP_BAD_REQUEST = 400;

const ARCHIVED_BY_TEXT = new Map([
  ["true", true],
  ["false", false],
]);

/**
 * The filter `@ArchiveField` registers. A list request carries its value as
 * text, so this reads `true` or `false` as the boolean the field stores, takes
 * a boolean a server caller passes as it is, then compares with `eq` or `ne`.
 *
 * @throws HTTPResult 400 when the value is not `true` or `false`, or the mode
 * is not `eq` or `ne`
 * @internal
 */
export function filterArchiveField(
  _context: RequestContext,
  proxy: ValueProxy<unknown>,
  _key: string,
  value: string | boolean,
  mode: string,
): ValueProxyOrValue<boolean> {
  const archived = isBoolean(value) ? value : ARCHIVED_BY_TEXT.get(value);
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

/**
 * Refuses a controller whose archive field another filter serves, such as a
 * `Filter()` declared above `@ArchiveField`. The archive filter is sent as
 * text, so a filter that does not read it would list archived rows as active.
 *
 * @throws Error when the archive field's filter is not {@link filterArchiveField}
 * @internal
 */
export function assertArchiveFieldFilter(
  controller: ControllerClass,
  archiveField: string | undefined,
): void {
  if (archiveField === undefined) return;
  const { filters } = GetMetadata(controller, DataAPIMeta);
  const filter = Object.hasOwn(filters, archiveField)
    ? filters[archiveField]
    : undefined;
  if (filter !== filterArchiveField) {
    throw new Error(
      `The archive field "${archiveField}" of ${controller.name} declares its own Filter, which replaces the one @ArchiveField registers: remove that Filter.`,
    );
  }
}
