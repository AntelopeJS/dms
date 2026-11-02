import { GetMetadata } from "@antelopejs/interface-core";
import {
  type Class,
  MakePropertyDecorator,
} from "@antelopejs/interface-core/decorators";

import { decoratedClass } from "../utils/internal/decorated-class";

export class SearchableMeta {
  public static key = Symbol();

  constructor(public readonly target: Class) {}

  public readonly searchableFields: Record<string, string> = {};

  /** A controller derived from this one searches the same fields. */
  public inherit(parent: SearchableMeta): void {
    Object.assign(this.searchableFields, parent.searchableFields);
  }

  public setSearchableField(key: string, compareMode: string) {
    this.searchableFields[key] = compareMode;
  }

  public getSearchableFields(): Record<string, string> {
    return this.searchableFields;
  }
}

const DEFAULT_COMPARE_MODE = "contains";

/**
 * Marks a data controller property as part of the list route's free-text search.
 * Search fields name database columns, so the property key must be a string:
 * a symbol (or other non-string) key throws a `TypeError` at decoration time.
 */
export const Searchable = MakePropertyDecorator(
  (target, key, compareMode?: string) => {
    const field = String(key);
    if (field !== key) {
      throw new TypeError(
        `@Searchable cannot be applied to the non-string property key ${field} of ${target.constructor.name}: search fields name database columns, which are strings`,
      );
    }
    const searchableMeta = GetMetadata(decoratedClass(target), SearchableMeta);
    searchableMeta.setSearchableField(
      field,
      compareMode ?? DEFAULT_COMPARE_MODE,
    );
  },
);
