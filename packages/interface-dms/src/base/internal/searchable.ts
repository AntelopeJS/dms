import { GetMetadata } from "@antelopejs/interface-core";
import { SearchableMeta } from "../searchable";

/**
 * Whether a controller declares `@Searchable` fields to search in.
 *
 * @internal
 */
export function hasSearchableFields(
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- Published controller constructor accepts arbitrary model instances; metadata lookup never constructs or parses them.
  controller: new (...args: unknown[]) => unknown,
): boolean {
  return (
    Object.keys(GetMetadata(controller, SearchableMeta).getSearchableFields())
      .length > 0
  );
}
