import type {
  ModuleEntryInput,
  ProjectConfigStep,
} from "@antelopejs/interface-dms-builder";
import {
  connectionAccess,
  withConnectionAccess,
} from "./connection-access-config";
import { z } from "zod";
import { isPlainObject } from "./value";

const CONNECTIONS = "externalConnections";

function grantRefusal(subject: string): string {
  return `refused to ${subject}: an agent never raises a connection's access. A person grants it: the Read & write switch at the top of the Database module's Data browser (dms-database's \`PUT /api/database/connections/<id>/access\`), or the assistant's connect step (dms-assistant's \`POST /database/project\`).`;
}

/** The values an access may be written as; anything else is refused. */
const WrittenAccessSchema = z
  .union([z.literal("read"), z.literal("read-write"), z.null()])
  .optional();

type WrittenAccess = z.infer<typeof WrittenAccessSchema>;

/** Whether writing `access` keeps or lowers what the connection has now. */
function keepsOrLowers(connection: string, access: WrittenAccess): boolean {
  return (
    access !== "read-write" ||
    connectionAccess(connection).access === "read-write"
  );
}

/** Why an entry is refused because it would raise a connection's access, or nothing. */
function raisedBy(entry: ModuleEntryInput): string | undefined {
  const connections = entry.config?.[CONNECTIONS];
  if (connections !== undefined && connections !== null) {
    if (!isPlainObject(connections)) {
      return grantRefusal(
        `replace \`config.${CONNECTIONS}\` with ${JSON.stringify(connections)}`,
      );
    }
    for (const [connection, setting] of Object.entries(connections)) {
      if (setting === undefined || setting === null) {
        continue;
      }
      const access = isPlainObject(setting) ? setting.access : setting;
      const written = WrittenAccessSchema.safeParse(access);
      if (
        !isPlainObject(setting) ||
        !written.success ||
        !keepsOrLowers(connection, written.data)
      ) {
        return grantRefusal(
          `set the access of connection "${connection}" to ${JSON.stringify(access)}`,
        );
      }
    }
  }
  const supplied = Object.keys(entry.env ?? {}).find(
    (configPath) =>
      configPath === CONNECTIONS || configPath.startsWith(`${CONNECTIONS}.`),
  );
  return supplied === undefined
    ? undefined
    : grantRefusal(`supply \`config.${supplied}\` from a variable`);
}

function raisedByAny(steps: readonly ProjectConfigStep[]): string | undefined {
  for (const step of steps) {
    const entry =
      step.op === "RemoveModule" || step.op === "RemoveConnection"
        ? undefined
        : step.entry;
    const refusal = entry && raisedBy(entry);
    if (refusal) {
      return refusal;
    }
  }
  return undefined;
}

/**
 * Why an agent's configuration steps are refused because one would raise a connection's access:
 * set `config.externalConnections.<id>.access` to `"read-write"` where the configuration does not
 * already give it, write anything else but `"read"` there, or let a variable supply it. Keeping,
 * lowering or removing an access passes, so a step may restate the connections it does not
 * change. Every MCP tool that writes project or module configuration calls this first; the
 * builder interface does not, since owner-authenticated routes grant through it.
 */
export function raisedAccessRefusal(
  steps: readonly ProjectConfigStep[],
): Promise<string | undefined> {
  return withConnectionAccess(() => raisedByAny(steps));
}
