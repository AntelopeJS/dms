import type {
  DatabaseAccess,
  DatabaseEngine,
} from "@antelopejs/interface-dms-builder";
import { failureMessage, noAnswerReason, unanswered } from "./database-access";
import { missingDriver, probeTarget, testProbeLoader } from "./driver-probe";
import { probeInChild } from "./probe-process";
import { accessOf, ReadProbeAnswer } from "./probe-answer";

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
  const loader = testProbeLoader();
  if (loader) {
    const probe = loader(engine);
    return probe
      ? accessOf(
          ReadProbeAnswer.parse(await probe({ url, timeoutMs, signal })),
          url,
        )
      : unanswered(missingDriver(engine));
  }
  const outcome = await probeInChild(
    { ...probeTarget(engine), url, timeoutMs },
    signal,
  );
  switch (outcome.kind) {
    case "missing":
      return unanswered(missingDriver(engine));
    case "failed":
      return unanswered(noAnswerReason(outcome.message, url));
    case "answer":
      return accessOf(ReadProbeAnswer.parse(outcome.answer), url);
  }
}

/**
 * Tests a customer's database live: whether a server answers at `url`, who it signs in, and
 * whether that account can read and write. The driver module of the engine is not configured
 * when this runs, so the check calls the `probe` its package exports, which decides with the
 * driver's own rule and closes what it opened. It runs it in a process of its own, so a driver that
 * throws on a socket event, holds the event loop or never answers ends only that process. It writes nothing to the project and answers,
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
