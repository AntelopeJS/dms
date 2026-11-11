import {
  GetInterfaceInstances,
  GetResponsibleModule,
  type InterfaceConnection,
  RunWithResponsibleModule,
} from "@antelopejs/interface-core";
import type * as Catalog from "@antelopejs/interface-database-catalog";
import { z } from "zod";
import { defineTool, type McpToolResult, textResult } from "../tool";

const CATALOG_INTERFACE = "@antelopejs/interface-database-catalog";

/**
 * The module this file belongs to, read while the module evaluates it. A tool
 * runs in the context of the module serving HTTP, so a lookup made there would
 * answer that module's connections, not the DMS's.
 */
const OWN_MODULE = GetResponsibleModule();

/** A catalog connection the project declares for the DMS, by its id. */
interface NamedConnection {
  id: string;
  /** Whether the DMS's plain import of the catalog reaches it. */
  selected: boolean;
}

function catalogConnections(): NamedConnection[] {
  const lookup = () => GetInterfaceInstances(CATALOG_INTERFACE);
  const connections: InterfaceConnection[] =
    OWN_MODULE === undefined
      ? lookup()
      : RunWithResponsibleModule(OWN_MODULE, lookup);
  return connections.flatMap(({ id, selected }) =>
    id === undefined || id.length === 0 ? [] : [{ id, selected }],
  );
}

function failed(error: { [key: string]: string | string[] }): McpToolResult {
  return textResult(JSON.stringify({ ok: false, error }), true);
}

/**
 * Runs `work` on the catalog of `connection`, answering a refusal the agent
 * reads when the connection is unknown or not the one the DMS reaches. The
 * DMS loads modules from literal specifiers only, so it reaches the catalog
 * through the connection its plain import selects.
 */
async function onCatalog(
  connection: string,
  work: (catalog: typeof Catalog) => Promise<string>,
): Promise<McpToolResult> {
  const connections = catalogConnections();
  const target = connections.find(({ id }) => id === connection);
  if (target === undefined) {
    return failed({
      code: "unknown_connection",
      connection,
      known: connections.map(({ id }) => id),
    });
  }
  if (!target.selected) {
    return failed({
      code: "unreachable_connection",
      connection,
      detail:
        "The DMS reaches only the catalog connection its import of @antelopejs/interface-database-catalog selects.",
      reachable: connections.flatMap(({ id, selected }) =>
        selected ? [id] : [],
      ),
    });
  }
  try {
    return textResult(
      await work(await import("@antelopejs/interface-database-catalog")),
    );
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

async function describeConnection({ id, selected }: NamedConnection) {
  if (!selected) return { connection: id, reachable: false };
  try {
    const catalog = await import("@antelopejs/interface-database-catalog");
    return { connection: id, reachable: true, ...(await catalog.Info()) };
  } catch (error) {
    return {
      connection: id,
      reachable: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const connections = defineTool({
  name: "database_connections",
  title: "List database connections",
  description:
    "Lists the databases the project connects the DMS to, each with its engine, version, database and role, and whether the DMS reaches it (`reachable`): the tools read the one connection the DMS's catalog import selects. Configuration declares them; when none is listed, connect one first with builder_configure_project.",
  effect: "read",
  input: z.object({}),
  run: async () =>
    textResult(
      JSON.stringify(
        await Promise.all(catalogConnections().map(describeConnection)),
      ),
    ),
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

/** The catalog tools: they read the connected database's catalog and aggregates, never its rows. */
export const DATABASE_TOOLS = [connections, relations, describe, profile];
