import { createRequire } from "node:module";
import type { Schema } from "@antelopejs/interface-database";
import { DATABASE_INTERFACE } from "./interface-ids";
import type { ResourceRecord } from "./resource-index";

/** The part of an `interface-database` instance a resource's table is found through. */
interface SchemaRegistry {
  Schema: Pick<typeof Schema, "get">;
}

function isSchemaRegistry(value: unknown): value is SchemaRegistry {
  return (
    typeof value === "object" &&
    value !== null &&
    "Schema" in value &&
    typeof value.Schema === "function" &&
    "get" in value.Schema &&
    typeof value.Schema.get === "function"
  );
}

/**
 * The schema a resource's table is registered in, as the module holding the resource resolves it.
 *
 * Each provider of `interface-database` keeps its own registry of schemas, and each module reaches
 * the provider its project entry binds it to. A module mapping a connection's tables is bound to
 * that connection's driver, which the builder's own import does not reach, so the package is
 * resolved from the resource's own file, the way the generated model resolves it.
 */
export function resourceSchema(record: ResourceRecord): Schema | undefined {
  const database: unknown = createRequire(record.databaseFile)(
    DATABASE_INTERFACE,
  );
  return isSchemaRegistry(database)
    ? database.Schema.get(record.schema)
    : undefined;
}
