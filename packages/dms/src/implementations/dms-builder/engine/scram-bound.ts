import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import { z } from "zod";

/** The most SCRAM iterations a checked server may ask for, as `pg` bounds them. */
export const MAX_SCRAM_ITERATIONS = 100_000;

/** What one bounded run records: the iteration count it refused, when it refused one. */
interface BoundedRun {
  refused?: number;
}

const runs = new AsyncLocalStorage<BoundedRun>();

/** Thrown in place of a derivation a run refused, so the client stops its sign-in. */
class IterationsRefused extends Error {}

function refuseAbove(iterations: number): void {
  const run = runs.getStore();
  if (run !== undefined && iterations > MAX_SCRAM_ITERATIONS) {
    run.refused = iterations;
    throw new IterationsRefused(
      `The server asks for ${iterations} SCRAM iterations; the check derives at most ${MAX_SCRAM_ITERATIONS}.`,
    );
  }
}

const deriveSync = crypto.pbkdf2Sync;
const subtle = crypto.webcrypto.subtle;
const deriveBits = subtle.deriveBits.bind(subtle);
/** The PBKDF2 parameters of a `deriveBits` call, which carry the iteration count. */
const Pbkdf2Params = z.object({ iterations: z.number() });

let installed = false;

/**
 * Bounds the SCRAM iterations a server can make a client derive, inside `bounded` only. A client
 * derives the count the server sends: `mongodb` 6 with `crypto.pbkdf2Sync`, which holds the event
 * loop for as long, and 7 with `crypto.subtle.deriveBits`, which holds a threadpool thread no
 * deadline can cancel. Outside a bounded run both behave as they always do.
 */
function install(): void {
  if (installed) {
    return;
  }
  installed = true;
  Object.defineProperty(crypto, "pbkdf2Sync", {
    configurable: true,
    writable: true,
    value: (...args: Parameters<typeof crypto.pbkdf2Sync>) => {
      refuseAbove(args[2]);
      return deriveSync(...args);
    },
  });
  Object.defineProperty(subtle, "deriveBits", {
    configurable: true,
    writable: true,
    value: (...args: Parameters<typeof subtle.deriveBits>) => {
      const params = Pbkdf2Params.safeParse(args[0]);
      if (params.success) {
        refuseAbove(params.data.iterations);
      }
      return deriveBits(...args);
    },
  });
}

/**
 * Runs `check` with SCRAM iterations bounded, and answers what it answered together with the
 * iteration count it refused, when it refused one.
 */
export async function withBoundedScram<Answer>(
  check: () => Promise<Answer>,
): Promise<{ answer: Answer; refused?: number }> {
  install();
  const run: BoundedRun = {};
  const answer = await runs.run(run, check);
  return run.refused === undefined
    ? { answer }
    : { answer, refused: run.refused };
}
