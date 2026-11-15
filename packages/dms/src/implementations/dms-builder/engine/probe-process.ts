import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  OUTCOME_MARK,
  PROBE_REQUEST,
  type ProbeOutcome,
  ProbeOutcomeSchema,
  type ProbeRequest,
} from "./probe-protocol";

const CHILD = path.join(__dirname, "probe-child.js");
const STDERR_LIMIT = 65_536;
const LINE_LIMIT = 65_536;
const ANSWER_LIMIT = 16_777_216;
const TOO_LARGE = "The driver's probe answered with more than the check reads.";
const ENDED = "The driver's probe ended without an answer";
/**
 * How long the check waits, once the child exits, for the rest of its stdout: a process it
 * started may hold the pipe open long after, so the check does not wait for the pipe to close.
 */
const EXIT_GRACE_MS = 200;
const UNREAD = "The driver's probe answered in a way the check does not read.";

/**
 * The environment the child runs with: the request alone, so no credential, token or setting of
 * this process reaches the driver. Windows also needs its system folder to open a socket.
 */
function childEnvironment(request: ProbeRequest): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    [PROBE_REQUEST]: JSON.stringify(request),
  };
  if (os.platform() === "win32") {
    environment.SystemRoot = process.env.SystemRoot;
    environment.WINDIR = process.env.WINDIR;
  }
  return environment;
}

/** The line of the child's stderr that starts with an error's name, which Node prints for an uncaught throw. */
function crashLine(stderr: string): string | undefined {
  return stderr
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^(?:[A-Z]\w*)?Error\b/.test(line));
}

/** The outcome a marked line holds, or a failure when it holds none the check reads. */
function outcomeOf(line: string): ProbeOutcome {
  try {
    const outcome = ProbeOutcomeSchema.safeParse(
      JSON.parse(line.slice(OUTCOME_MARK.length)),
    );
    return outcome.success ? outcome.data : { kind: "failed", message: UNREAD };
  } catch {
    return { kind: "failed", message: UNREAD };
  }
}

/**
 * Reads the child's stdout as it comes, line by line, and calls `found` with the outcome of the
 * first marked line. Only the line not yet ended is kept, so whatever a driver prints costs the
 * check no more than one pass over it: an unmarked line longer than `LINE_LIMIT` is dropped as it
 * comes, and a marked one longer than `ANSWER_LIMIT` is answered as a failure.
 */
function outcomeReader(
  found: (outcome: ProbeOutcome) => void,
): (text: string) => void {
  let pending = "";
  let dropping = false;
  let done = false;
  const finish = (line: string) => {
    if (!dropping && line.startsWith(OUTCOME_MARK)) {
      done = true;
      found(outcomeOf(line));
    }
    dropping = false;
  };
  return (text) => {
    let start = 0;
    let end = text.indexOf("\n");
    while (!done && end >= 0) {
      finish(pending + text.slice(start, end));
      pending = "";
      start = end + 1;
      end = text.indexOf("\n", start);
    }
    if (done || dropping) {
      return;
    }
    pending += text.slice(start);
    const marked = pending.startsWith(OUTCOME_MARK);
    if (pending.length > (marked ? ANSWER_LIMIT : LINE_LIMIT)) {
      if (marked) {
        done = true;
        found({ kind: "failed", message: TOO_LARGE });
      }
      pending = "";
      dropping = true;
    }
  };
}

/**
 * Runs the driver's `probe` in a process of its own and answers what it came to. A driver that
 * throws on a socket event, holds the event loop or the threadpool, or never answers ends only
 * that process: the check kills it when `signal` aborts, which it does once it has its answer or
 * when its deadline passes, and once the child has exited it closes its ends of the pipes. The
 * child gets no environment but its request, and none of this process's Node options.
 */
export function probeInChild(
  request: ProbeRequest,
  signal: AbortSignal,
): Promise<ProbeOutcome> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CHILD], {
      env: childEnvironment(request),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    let outcome: ProbeOutcome | undefined;
    const read = outcomeReader((found) => {
      outcome = found;
      resolve(found);
    });
    const kill = () => {
      child.kill("SIGKILL");
    };
    signal.addEventListener("abort", kill, { once: true });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", read);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text: string) => {
      if (stderr.length < STDERR_LIMIT) {
        stderr = (stderr + text).slice(0, STDERR_LIMIT);
      }
    });
    child.on("error", (error) => {
      resolve({ kind: "failed", message: error.message });
    });
    let ended = false;
    const end = (code: number | null, exitSignal: NodeJS.Signals | null) => {
      if (ended) {
        return;
      }
      ended = true;
      signal.removeEventListener("abort", kill);
      child.stdout.destroy();
      child.stderr.destroy();
      const line = crashLine(stderr);
      resolve(
        outcome ?? {
          kind: "failed",
          message:
            line === undefined
              ? `${ENDED} (${exitSignal ?? code ?? "unknown"}).`
              : `${ENDED}: ${line}`,
        },
      );
    };
    child.on("close", end);
    child.on("exit", (code, exitSignal) => {
      setTimeout(() => end(code, exitSignal), EXIT_GRACE_MS).unref();
    });
    if (signal.aborted) {
      kill();
    }
  });
}
