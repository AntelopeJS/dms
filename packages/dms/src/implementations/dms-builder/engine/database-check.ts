import type {
  DatabaseAccess,
  DatabaseEngine,
} from "@antelopejs/interface-dms-builder";
import { failureMessage, noAnswerReason, unanswered } from "./database-access";
import { loadProbe, missingDriver } from "./driver-probe";
import { accessOf, readProbeAnswer } from "./probe-answer";

/** How long a probe waits for a server to connect, and for each answer. */
export const CONNECT_TIMEOUT_MS = 5000;

/** The whole check ends within this many connect timeouts, whatever a driver does. */
const DEADLINE_IN_TIMEOUTS = 3;
const TOO_SLOW = "The database did not answer in time.";
const UNREADABLE_FAILURE = "The check ended with an error it could not read.";

async function probeWithDriver(
  engine: DatabaseEngine,
  url: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<DatabaseAccess> {
  const probe = loadProbe(engine);
  if (!probe) {
    return unanswered(missingDriver(engine));
  }
  return accessOf(
    readProbeAnswer(await probe({ url, timeoutMs, signal })),
    url,
  );
}

/**
 * Tests a customer's database live: whether a server answers at `url`, who it signs in, and
 * whether that account can read and write. The driver module of the engine is not configured
 * when this runs, so the check calls the `probe` its package exports, which decides with the
 * driver's own rule and closes what it opened. It writes nothing to the project and answers,
 * never rejects. When the deadline passes first, the check answers that the database did not
 * answer in time, and aborts the probe's signal, which closes its connections; it aborts it once
 * the probe has answered too.
 */
export async function checkDatabase(
  engine: DatabaseEngine,
  url: string,
  timeoutMs: number = CONNECT_TIMEOUT_MS,
): Promise<DatabaseAccess> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<DatabaseAccess>((resolve) => {
    timer = setTimeout(
      () => resolve(unanswered(TOO_SLOW)),
      timeoutMs * DEADLINE_IN_TIMEOUTS,
    );
  });
  try {
    return await Promise.race([
      probeWithDriver(engine, url, timeoutMs, controller.signal)
        .catch((error: unknown) =>
          unanswered(noAnswerReason(failureMessage(error), url)),
        )
        .catch(() => unanswered(UNREADABLE_FAILURE)),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
