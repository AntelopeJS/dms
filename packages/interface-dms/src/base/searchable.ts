import { GetMetadata } from "@antelopejs/interface-core";
import { MakePropertyDecorator } from "@antelopejs/interface-core/decorators";

export class SearchableMeta {
  public static key = Symbol();

  constructor(public readonly target: new (...args: unknown[]) => unknown) {}

  public readonly searchableFields: Record<string, string> = {};

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
    searchableMeta.setSearchableField(key as string, effectiveCompareMode);
  },
);
