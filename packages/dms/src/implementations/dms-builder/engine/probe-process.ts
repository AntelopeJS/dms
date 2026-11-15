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

/** What starts the child's answer: the mark, on a line of its own, as the child writes it. */
const ANSWER_START = `\n${OUTCOME_MARK}`;

/**
 * Reads the child's stdout as it comes, and calls `found` with the outcome of the first marked
 * line. Until the mark it only searches each chunk for it, keeping the few characters a mark split
 * across two chunks needs, so whatever a driver prints costs one scan; from the mark it keeps the
 * answer's line, and answers a failure when that line grows past `ANSWER_LIMIT`.
 */
function outcomeReader(
  found: (outcome: ProbeOutcome) => void,
): (text: string) => void {
  let carry = "\n";
  let answer: string | undefined;
  let done = false;
  const take = (text: string) => {
    const end = text.indexOf("\n");
    answer = (answer ?? "") + (end < 0 ? text : text.slice(0, end));
    if (end >= 0) {
      done = true;
      found(outcomeOf(answer));
    } else if (answer.length > ANSWER_LIMIT) {
      done = true;
      found({ kind: "failed", message: TOO_LARGE });
    }
  };
  return (text) => {
    if (done) {
      return;
    }
    if (answer !== undefined) {
      take(text);
      return;
    }
    const scanned = carry + text;
    const start = scanned.indexOf(ANSWER_START);
    if (start < 0) {
      carry = scanned.slice(-(ANSWER_START.length - 1));
      return;
    }
    answer = "";
    take(scanned.slice(start + 1));
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
