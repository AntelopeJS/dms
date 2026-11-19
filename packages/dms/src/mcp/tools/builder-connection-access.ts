import type {
  OpResult,
  ProjectConfigResult,
} from "@antelopejs/interface-dms-builder";
import type { ConnectionAccess } from "@antelopejs/interface-dms/connection-access";
import { z } from "zod";
import { type McpToolResult, textResult } from "../tool";
import { type RedactedData, redactedResult } from "../redact";

export const CONNECTION = z
  .string()
  .describe("A connection id from database_connections.");
export const BOUND_MODULE = z
  .string()
  .describe("The project module bound to the connection's database.");

/** What the project lets the dashboard do on a connection, read from its configuration now. */
async function currentAccess(connection: string): Promise<ConnectionAccess> {
  const { connectionAccess, withConnectionAccess } =
    await import("../../implementations/dms-builder/engine");
  return withConnectionAccess(() => connectionAccess(connection).access);
}

/**
 * An answer about one connection as the AI reads it, `redact` applied to its data, with `access`
 * beside it once it succeeded.
 */
export async function answerWithAccess<T>(
  answer: OpResult<T>,
  connection: string | undefined,
  redact: (data: T) => RedactedData | ProjectConfigResult,
): Promise<McpToolResult> {
  const shown = redactedResult(answer, redact);
  if (!answer.ok || connection === undefined) {
    return textResult(JSON.stringify(shown), !answer.ok);
  }
  return textResult(
    JSON.stringify({ ...shown, access: await currentAccess(connection) }),
  );
}
