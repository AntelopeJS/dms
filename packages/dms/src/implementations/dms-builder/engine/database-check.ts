import type {
  DatabaseAccess,
  DatabaseEngine,
} from "@antelopejs/interface-dms-builder";
import {
  failureMessage,
  noAnswerReason,
  type Probe,
  unanswered,
} from "./database-access";
import { ProbeConnections } from "./probe-connections";
import { probeMongodb } from "./probe-mongodb";
import { probeMysql } from "./probe-mysql";
import { probePostgres } from "./probe-postgres";
import { probeRethinkdb } from "./probe-rethinkdb";

/** How long a probe waits for a server to connect, and for each answer. */
export const CONNECT_TIMEOUT_MS = 5000;

/** The whole check ends within this many connect timeouts, whatever a client does. */
const DEADLINE_IN_TIMEOUTS = 3;
const TOO_SLOW = "The database did not answer in time.";

const PROBES: Record<DatabaseEngine, Probe> = {
  postgres: probePostgres,
  mysql: probeMysql,
  mongodb: probeMongodb,
  rethinkdb: probeRethinkdb,
};

/**
 * Tests a customer's database live: whether a server answers at `url`, who it signs in, and
 * whether that account can read and write. The driver module of the engine is not configured
 * when this runs, so the check opens the database itself with the engine's client library. It
 * writes nothing to the project and answers, never rejects. Every connection the probe opened is
 * closed when it answers and when the deadline passes, and the answer never waits for the close: a
 * server that ignores the goodbye cannot delay it or replace it with the deadline's, and a socket
 * still open a short grace after the close began is shut, whatever the server is doing.
 */
export async function checkDatabase(
  engine: DatabaseEngine,
  url: string,
  timeoutMs: number = CONNECT_TIMEOUT_MS,
  probes: Readonly<Record<DatabaseEngine, Probe>> = PROBES,
): Promise<DatabaseAccess> {
  const connections = new ProbeConnections();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<DatabaseAccess>((resolve) => {
    timer = setTimeout(
      () => resolve(unanswered(TOO_SLOW)),
      timeoutMs * DEADLINE_IN_TIMEOUTS,
    );
  });
  try {
    return await Promise.race([
      probes[engine](url, timeoutMs, connections).catch((error: unknown) =>
        unanswered(noAnswerReason(failureMessage(error), url)),
      ),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
    connections.closeAll();
  }
}
