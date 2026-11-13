import type {
  ModuleEntryInput,
  ProjectConfigStep,
} from "@antelopejs/interface-dms-builder";
import { isPlainObject } from "./value";

const CONNECTIONS = "externalConnections";

function grantRefusal(subject: string): string {
  return `refused to ${subject}: an agent never raises a connection's access. A person grants it: the Read & write switch at the top of the Database module's Data browser, or the assistant's connect step.`;
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
      if (
        !isPlainObject(setting) ||
        (access !== undefined && access !== null && access !== "read")
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

/**
 * Why configuration steps are refused because one would set a connection's access to anything
 * but `"read"`, on any module, or let a variable supply it; nothing when they only keep, lower
 * or remove it. The builder's interface, and so every agent, goes through this; only an
 * owner-authenticated route may call the engine's `configureProject` without it.
 */
export function accessRaiseRefusal(
  steps: readonly ProjectConfigStep[],
): string | undefined {
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
