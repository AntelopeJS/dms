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
const OUTPUT_LIMIT = 1_048_576;
const ENDED = "The driver's probe ended without an answer";
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

/** The outcome in the child's marked stdout line, once it has written it whole. */
function outcomeIn(stdout: string): ProbeOutcome | undefined {
  const line = stdout
    .split("\n")
    .slice(0, -1)
    .find((candidate) => candidate.startsWith(OUTCOME_MARK));
  if (line === undefined) {
    return undefined;
  }
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
 * Runs the driver's `probe` in a process of its own and answers what it came to. A driver that
 * throws on a socket event, holds the event loop or the threadpool, or never answers ends only
 * that process: the check kills it when `signal` aborts, which it does once it has its answer or
 * when its deadline passes. The child gets no environment but its request, and none of this
 * process's Node options.
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
    let stdout = "";
    let stderr = "";
    const kill = () => {
      child.kill("SIGKILL");
    };
    signal.addEventListener("abort", kill, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString("utf8")).slice(-OUTPUT_LIMIT);
      const outcome = outcomeIn(stdout);
      if (outcome !== undefined) {
        resolve(outcome);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(0, OUTPUT_LIMIT);
    });
    child.on("error", (error) => {
      resolve({ kind: "failed", message: error.message });
    });
    child.on("exit", (code, exitSignal) => {
      signal.removeEventListener("abort", kill);
      const line = crashLine(stderr);
      resolve(
        outcomeIn(stdout) ?? {
          kind: "failed",
          message:
            line === undefined
              ? `${ENDED} (${exitSignal ?? code ?? "unknown"}).`
              : `${ENDED}: ${line}`,
        },
      );
    });
    if (signal.aborted) {
      kill();
    }
  });
}
