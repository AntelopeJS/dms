import type { RelationDescription } from "@antelopejs/interface-database-catalog";
import type {
  MapResourcesInput,
  OpWarning,
} from "@antelopejs/interface-dms-builder";
import { relationName } from "./map-resources-plan";

/** A batch as it is mapped, and a warning for each relation it maps read-only though asked writable. */
interface RowWritesBatch {
  input: MapResourcesInput;
  warnings: OpWarning[];
}

/** Whether the catalog's account may insert, update or delete any row of the relation. */
function writesRows({ writes }: RelationDescription): boolean {
  return writes.insert || writes.update || writes.delete;
}

/**
 * The batch with every relation the catalog's account may not insert, update or delete in mapped
 * `writable: false`, so its TableView serves no write the database would refuse. A connection's
 * access can be `"read-write"` while the account writes only some of its relations.
 */
export function withRowWrites(
  input: MapResourcesInput,
  descriptions: readonly RelationDescription[],
): RowWritesBatch {
  const readOnly = new Set(
    descriptions
      .filter((description) => !writesRows(description))
      .map((description) => relationName(description)),
  );
  const narrowed = input.resources.filter(
    (resource) =>
      resource.tableView &&
      resource.writable &&
      readOnly.has(resource.relation),
  );
  return {
    input: {
      ...input,
      resources: input.resources.map((resource) =>
        readOnly.has(resource.relation)
          ? { ...resource, writable: false }
          : resource,
      ),
    },
    warnings: narrowed.map((resource) => ({
      code: "relation_read_only",
      message: `${resource.relation}: mapped read-only, since the database account may not insert, update or delete its rows`,
    })),
  };
}
