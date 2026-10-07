import { GetMetadata } from "@antelopejs/interface-core";
import { SearchableMeta } from "../searchable";

/**
 * Whether a controller declares `@Searchable` fields to search in.
 *
 * @internal
 */
export function hasSearchableFields(
  controller: new (...args: unknown[]) => unknown,
): boolean {
  return (
    Object.keys(GetMetadata(controller, SearchableMeta).getSearchableFields())
      .length > 0
  );
}
