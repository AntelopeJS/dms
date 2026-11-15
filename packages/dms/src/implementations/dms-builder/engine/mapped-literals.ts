import type {
  ConfigValue,
  MapResourcesInput,
} from "@antelopejs/interface-dms-builder";
import { tabsOf } from "./column-display";
import { TABLE_BLOCK } from "./map-resources-pages";
import { currentColumns, pageOf } from "./mapped-displays";
import { recordRowLiterals } from "./mapped-modules";
import { buildPageStructure } from "./page-structure";
import { mappedRecordsOf, type ResourceRecord } from "./resource-index";
import { buildResourceStructure } from "./resource-structure";
import {
  mapPageRowLiterals,
  mapResourceRowLiterals,
  rowLiteralDigest,
  rowLiteralsOf,
} from "./row-literals";

/**
 * The row literals a relation's mapping wrote: its fields' select items and currencies, the tabs
 * each of its badges makes, and the tabs its page's table holds.
 */
function writtenRowLiterals(
  connection: string,
  record: ResourceRecord,
): ConfigValue[] {
  const resource = buildResourceStructure(record.ref);
  const page = pageOf(connection, record);
  const table = page && buildPageStructure(page.ref);
  return [
    ...(resource.ok
      ? rowLiteralsOf((map) => mapResourceRowLiterals(resource.data, map))
      : []),
    ...[...currentColumns(record).displays].flatMap(([column, display]) =>
      display.kind === "badge" ? [tabsOf(column, display)] : [],
    ),
    ...(table?.ok
      ? rowLiteralsOf((map) =>
          mapPageRowLiterals(
            {
              ...table.data,
              blocks: table.data.blocks.filter(
                (block) => block.name === TABLE_BLOCK,
              ),
            },
            map,
          ),
        )
      : []),
  ];
}

/** Records the digest of each row literal the module's relations were mapped with. */
export function recordWrittenLiterals(input: MapResourcesInput): void {
  const literals = [...mappedRecordsOf(input.module).values()].flatMap(
    (record) => writtenRowLiterals(input.connection, record),
  );
  recordRowLiterals(input.module, literals.map(rowLiteralDigest));
}
