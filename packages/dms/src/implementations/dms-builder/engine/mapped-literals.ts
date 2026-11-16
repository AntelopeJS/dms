import type {
  ConfigValue,
  PageStructure,
  ResourceStructure,
} from "@antelopejs/interface-dms-builder";
import {
  holdsMappedCodeOf,
  mappedLiteralTestOf,
  recordRowLiterals,
} from "./mapped-modules";
import { buildPageStructure } from "./page-structure";
import { mappedRecordsOf } from "./resource-index";
import { buildResourceStructure } from "./resource-structure";
import {
  mapPageRowLiterals,
  mapResourceRowLiterals,
  type RowLiteralMap,
  rowLiteralsOf,
  rowValueDigest,
  rowValuesOf,
} from "./row-literals";
import { listPageRecords } from "./source-index";

/**
 * A row literal a mapping wrote, as the AI reads it: how many values it stands for. A badge's
 * items, a price's currency and a TableView's tabs are such literals.
 */
export type HiddenValue = { $hidden: number };

function hiddenValue(value: ConfigValue): HiddenValue {
  return { $hidden: Array.isArray(value) ? value.length : 1 };
}

/** Each row literal of a file that a mapping wrote, as a {@link HiddenValue}. */
function hiddenIn(file: string): RowLiteralMap {
  const isMapped = mappedLiteralTestOf(file);
  return (value) => (isMapped(value) ? hiddenValue(value) : value);
}

/** A resource as the AI reads it: each badge's items and price's currency a mapping wrote hidden. */
export function shownResourceStructure(
  structure: ResourceStructure,
): ResourceStructure {
  return mapResourceRowLiterals(structure, hiddenIn(structure.files.dataApi));
}

/** A page as the AI reads it: each TableView's tabs, badge's items and currency a mapping wrote hidden. */
export function shownPageStructure(structure: PageStructure): PageStructure {
  return mapPageRowLiterals(structure, hiddenIn(structure.page.filepath));
}

/** The select items and currencies of the fields of a module's mapped relations. */
function resourceLiterals(module: string): ConfigValue[] {
  return [...mappedRecordsOf(module).values()].flatMap((record) => {
    const resource = buildResourceStructure(record.ref);
    return resource.ok
      ? rowLiteralsOf((map) => mapResourceRowLiterals(resource.data, map))
      : [];
  });
}

/** The row literals of every page that may hold code of a module's mapping, wherever it lies. */
function pageLiterals(module: string): ConfigValue[] {
  return listPageRecords()
    .filter((page) => holdsMappedCodeOf(page.filepath, module))
    .flatMap((page) => {
      const structure = buildPageStructure(page.ref);
      return structure.ok
        ? rowLiteralsOf((map) => mapPageRowLiterals(structure.data, map))
        : [];
    });
}

/**
 * Records the digest of each value from rows the module's relations were mapped with, beside the
 * ones `kept` from before the mapping wrote. A module that kept none was mapped before dms
 * recorded them: every page over its code counts as the mapping's, as it was read until now.
 */
export function recordWrittenLiterals(
  module: string,
  kept: string[] | undefined,
): void {
  const literals = [
    ...resourceLiterals(module),
    ...(kept === undefined ? pageLiterals(module) : []),
  ];
  recordRowLiterals(module, [
    ...(kept ?? []),
    ...literals.flatMap(rowValuesOf).map(rowValueDigest),
  ]);
}
