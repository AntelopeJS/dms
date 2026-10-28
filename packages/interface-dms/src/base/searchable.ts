import { GetMetadata } from "@antelopejs/interface-core";
import { MakePropertyDecorator } from "@antelopejs/interface-core/decorators";

export class SearchableMeta {
  public static key = Symbol();

  // oxlint-disable-next-line anti-slop/no-unknown-returns -- Published metadata accepts arbitrary controller constructors; it does not own their instance schemas.
  constructor(public readonly target: new (...args: unknown[]) => unknown) {}

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

export const Searchable = MakePropertyDecorator(
  (target, key, compareMode?: string) => {
    const searchableMeta = GetMetadata(target.constructor, SearchableMeta);
    const effectiveCompareMode = compareMode ?? DEFAULT_COMPARE_MODE;
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Decorators also receive symbols; preserve the existing unchecked symbol behavior rather than change this public decorator.
    searchableMeta.setSearchableField(key as string, effectiveCompareMode);
  },
);
