import { GetDatabaseProject } from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import {
  type CatalogConnection,
  catalogOf,
  listCatalogConnections,
} from "../../implementations/dms-builder/engine/catalog-connection";
import { defineTool, type McpToolResult, textResult } from "../tool";
import { opResult } from "./builder-shared";

function failed(error: { [key: string]: string | string[] }): McpToolResult {
  return textResult(JSON.stringify({ ok: false, error }), true);
}

async function onCatalog(
  connection: string,
  work: (catalog: CatalogConnection) => Promise<string>,
): Promise<McpToolResult> {
  try {
    const catalog = catalogOf(connection);
    if (catalog === undefined) {
      return failed({
        code: "unknown_connection",
        connection,
        known: listCatalogConnections(),
      });
    }
    return textResult(await work(catalog));
  } catch (error) {
    return failed({
      code: "catalog_failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

const CONNECTION = z
  .string()
  .describe("A connection id from database_connections, e.g. `erp`.");
const RELATION = z
  .string()
  .describe('A relation named `"schema.name"`, e.g. `sales.accounts`.');
const COLUMN_REFERENCE = z.object({ relation: RELATION, column: z.string() });

async function describeConnection(connection: string) {
  try {
    return { connection, ...(await catalogOf(connection)?.Info()) };
  } catch (error) {
    return {
      connection,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const connections = defineTool({
  name: "database_connections",
  title: "List database connections",
  description:
    "Lists the databases the project connects the DMS to, each with its engine, version, database and role, or `error` when its provider does not answer. Configuration declares them; when none is listed, read database_project, then connect one with builder_configure_project.",
  effect: "read",
  input: z.object({}),
  run: async () =>
    textResult(
      JSON.stringify(
        await Promise.all(listCatalogConnections().map(describeConnection)),
      ),
    ),
});

const project = defineTool({
  name: "database_project",
  title: "Read the project's database wiring",
  description:
    "Answers what a builder_configure_project batch that connects a database needs: `modules`, the module ids antelope.config.ts holds; `self`, the DMS's module id, which declares the catalog connection; `ownDatabase`, the project's default interface-database provider; `databasePins`, the modules to pin to it; `dmsDatabase`, the dms-database module id; `interfaceDatabase`, the version core resolves; and `drivers`, each engine's driver package with the only range the project can start, to write as the AddModule source version unchanged. An engine absent from `drivers` has no release built for that version.",
  effect: "read",
  input: z.object({}),
  run: async () => opResult(await GetDatabaseProject()),
});

const relations = defineTool({
  name: "database_relations",
  title: "List database relations",
  description:
    "Lists every relation of a connection (tables, views and their kin; MongoDB collections and RethinkDB tables), with its row estimate and where it came from, its key (the columns `_id` aliases, or null), what the connected account may write, its comment, and `unmappable` with the reason when it cannot be mapped.",
  effect: "read",
  input: z.object({
    connection: CONNECTION,
    schemas: z.array(z.string()).optional(),
  }),
  run: ({ connection, schemas }) =>
    onCatalog(connection, async (catalog) =>
      JSON.stringify(await catalog.ListRelations(schemas)),
    ),
});

const describe = defineTool({
  name: "database_describe",
  title: "Describe database relations",
  description:
    "Describes relations in full: every column's native type (for a document database, the types its sample holds with their shares), nullability, default, generated/identity, enum labels, comment, `accepts` (the declarations registration takes, the one to propose first; empty with `unsupported` when none applies) and `readOnly`; indexes; declared references out (`references`) and in (`referencedBy`), which document databases never have. Describe in batches of up to 20.",
  effect: "read",
  input: z.object({
    connection: CONNECTION,
    relations: z.array(RELATION).min(1),
  }),
  run: ({ connection, relations: names }) =>
    onCatalog(connection, async (catalog) =>
      JSON.stringify(await catalog.DescribeRelations(names)),
    ),
});

const profile = defineTool({
  name: "database_profile",
  title: "Profile a database relation",
  description:
    "Profiles one relation with aggregates only, without writing: rows, and per column nulls, distinct, numeric/date/enum ranges, months, categories (values of few-valued columns, each seen at least 5 times) and text lengths, with traits (enum-like, identifier-like, label-candidate, time-axis, measure); children per parent over each declared reference. A measure past its time answers `timeout`. Large relations are sampled. `references` checks columns that look like references the database does not declare: containment of their values in the target column, and whether the target is a key.",
  effect: "read",
  input: z.object({
    connection: CONNECTION,
    relation: RELATION.optional(),
    columns: z.array(z.string()).optional(),
    references: z
      .array(z.object({ from: COLUMN_REFERENCE, to: COLUMN_REFERENCE }))
      .optional(),
  }),
  run: ({ connection, relation, columns, references }) =>
    onCatalog(connection, async (catalog) =>
      JSON.stringify({
        profile:
          relation === undefined
            ? undefined
            : await catalog.Profile({ relation, columns }),
        references: await Promise.all(
          (references ?? []).map((check) => catalog.CheckReference(check)),
        ),
      }),
    ),
});

export const DATABASE_TOOLS = [
  connections,
  project,
  relations,
  describe,
  profile,
];
