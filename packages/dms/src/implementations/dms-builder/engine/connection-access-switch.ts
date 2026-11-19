import type { ConnectionAccess } from "@antelopejs/interface-dms/connection-access";
import type { ProjectConfigStep } from "@antelopejs/interface-dms-builder";
import { catalogOf, listCatalogConnections } from "./catalog-connection";
import { isConnectionRefusal } from "./database-connection";
import { dmsDatabaseId } from "./dms-database";
import { writesRows } from "./row-writes";

/** The configuration step that writes a connection's access, or why it is refused. */
export type AccessSwitch =
  | { ok: true; step: ProjectConfigStep }
  | { ok: false; code: "not_found" | "invalid_config"; reason: string };

function refused(
  code: "not_found" | "invalid_config",
  reason: string,
): AccessSwitch {
  return { ok: false, code, reason };
}

/** Why the connection's account cannot be shown to write any table, or nothing when it may write one. */
async function writeGrantRefusal(
  connection: string,
): Promise<string | undefined> {
  const subject = `refused to allow changes on connection "${connection}"`;
  try {
    const relations = (await catalogOf(connection)?.ListRelations()) ?? [];
    return relations.some(writesRows)
      ? undefined
      : `${subject}: its database account may not insert, update or delete rows in any table, so the dashboard could change nothing. Ask the person to grant the account write privileges on the tables the dashboard should change, then try again.`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `${subject}: the builder could not check what its database account may write, since its catalog answered: ${detail}. Check that the database is reachable, then try again.`;
  }
}

/** The id of the dms-database entry, or why the configuration cannot say. */
function dmsDatabaseEntry(): { id: string } | { refusal: string } {
  try {
    const id = dmsDatabaseId();
    return id === undefined
      ? {
          refusal:
            "the project has no dms-database module, whose `config.externalConnections` holds a connection's access: add it, then try again",
        }
      : { id };
  } catch (error) {
    if (isConnectionRefusal(error)) {
      return { refusal: error.message };
    }
    throw error;
  }
}

/**
 * The `ConfigureModule` step that writes `config.externalConnections.<connection>.access` on the
 * dms-database entry, the step the Read & write switch of the Database module's Data browser
 * sends. `"read-write"` is refused while the connection's database account may insert, update or
 * delete rows in no table, the rule that maps each such table read-only, and when its catalog does
 * not answer. `"read"` is not checked, so lowering an access always passes.
 *
 * @param connection The catalog connection's id
 * @param access The access to write
 */
export async function connectionAccessSwitch(
  connection: string,
  access: ConnectionAccess,
): Promise<AccessSwitch> {
  if (!listCatalogConnections().includes(connection)) {
    return refused(
      "not_found",
      `no catalog connection "${connection}" is declared: read database_connections for the ids the project declares`,
    );
  }
  const entry = dmsDatabaseEntry();
  if ("refusal" in entry) {
    return refused("invalid_config", entry.refusal);
  }
  const refusal =
    access === "read-write" ? await writeGrantRefusal(connection) : undefined;
  if (refusal !== undefined) {
    return refused("invalid_config", refusal);
  }
  return {
    ok: true,
    step: {
      op: "ConfigureModule",
      id: entry.id,
      entry: { config: { externalConnections: { [connection]: { access } } } },
    },
  };
}
