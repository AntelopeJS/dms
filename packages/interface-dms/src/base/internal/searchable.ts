import { GetMetadata } from "@antelopejs/interface-core";
import type { Class } from "@antelopejs/interface-core/decorators";
import { SearchableMeta } from "../searchable";

/**
 * Whether a controller declares `@Searchable` fields to search in.
 *
 * @internal
 */
export function hasSearchableFields(controller: Class): boolean {
  return (
    Object.keys(GetMetadata(controller, SearchableMeta).getSearchableFields())
      .length > 0
  );
}
