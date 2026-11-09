import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { bystander, newRun, storedRun } from "./helpers/fake-run.mjs";
import { currentNamespaces, isRunning, startTimeOf } from "./identity.mjs";
import {
  decode,
  isBoolean,
  isNumber,
  isString,
  nullable,
  objectOf,
} from "./json.mjs";
import { saveRun } from "./run-state.mjs";

const CONTROL_BIN = join(import.meta.dirname, "..", "dms-control.mjs");
const NESTED_TIMEOUT_MS = 60_000;
const BOOTTIME_OFFSET_S = "1000";

/**
 * Runs in a PID namespace of its own, as `up` would there: it starts a
 * process the way a run does, records it with the namespaces it runs in,
 * says `ready`, waits for a line on stdin, then runs `dms-control down` on
 * the run from inside and reports whether its process ran before and after.
 */
const NESTED = `
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
const [bin, dir] = process.argv.slice(1);
const control = new URL("./control/", "file://" + bin);
const { startDetached } = await import(new URL("processes.mjs", control));
const { currentNamespaces, isRunning } = await import(new URL("identity.mjs", control));
const { loadRun, saveRun } = await import(new URL("run-state.mjs", control));
const own = startDetached({ name: "own", program: "sleep", args: ["60"], cwd: dir, env: process.env, logs: dir });
const state = loadRun(dir);
state.namespaces = currentNamespaces();
state.processes = [own];
saveRun(state);
const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
console.log("ready");
await lines.next();
const before = isRunning(own.pid);
const down = spawnSync(process.execPath, [bin, "down", dir], { encoding: "utf8" });
await sleep(200);
console.log(JSON.stringify({ before, down: down.status, stderr: down.stderr, after: isRunning(own.pid) }));
process.exit(0);
`;

const isNestedReport = objectOf({
  before: isBoolean,
  down: nullable(isNumber),
  stderr: isString,
  after: isBoolean,
});

/** @returns {boolean} True where the test may make a user and PID namespace */
function canUnshare() {
  return (
    spawnSync("unshare", ["-Ur", "--fork", "--pid", "--mount-proc", "true"])
      .status === 0
  );
}

/** @returns {boolean} True where the test may make a user and time namespace */
function canUnshareTime() {
  return (
    spawnSync("unshare", ["-Ur", "--time", "--boottime", "1", "true"])
      .status === 0
  );
}

await test(
  "down run outside the PID namespace the run was started in refuses and changes nothing; inside it, down stops the run's process; a version without the check exits 0, forgets the process and leaves it running",
  {
    skip:
      !canUnshare() && "this host does not let the test make a PID namespace",
    timeout: NESTED_TIMEOUT_MS,
  },
  async (t) => {
    const state = await newRun(t);
    const nested = spawn(
      "unshare",
      [
        "-Ur",
        "--fork",
        "--pid",
        "--mount-proc",
        process.execPath,
        "--input-type=module",
        "-e",
        NESTED,
        CONTROL_BIN,
        state.dir,
      ],
      { stdio: ["pipe", "pipe", "inherit"] },
    );
    t.after(() => nested.kill("SIGKILL"));
    const lines = createInterface({ input: nested.stdout })[
      Symbol.asyncIterator
    ]();
    assert.equal((await lines.next()).value, "ready");
    const recorded = storedRun(state.dir);

    const outside = spawnSync(
      process.execPath,
      [CONTROL_BIN, "down", state.dir],
      {
        encoding: "utf8",
      },
    );
    assert.equal(outside.status, 1, outside.stderr);
    assert.match(
      outside.stderr,
      /this run was started in another PID namespace \(run: pid:\[\d+\]; here: pid:\[\d+\]\); run this command there/,
    );
    assert.equal(storedRun(state.dir), recorded);
    assert.ok(
      existsSync(state.home),
      "down from outside keeps the run's folders",
    );

    nested.stdin.write("go\n");
    /** @type {unknown} */
    const parsed = JSON.parse(String((await lines.next()).value));
    const report = decode(isNestedReport, parsed, "the nested run", "a report");
    assert.equal(
      report.before,
      true,
      "the run's process outlives the refused down",
    );
    assert.equal(report.down, 0, report.stderr);
    assert.equal(report.after, false, "down inside stops the run's process");
  },
);

await test(
  "down run in another time namespace refuses and changes nothing; a version without the check reads every start time shifted, exits 0 and forgets the process while it runs",
  {
    skip:
      !canUnshareTime() &&
      "this host does not let the test make a time namespace",
  },
  async (t) => {
    const state = await newRun(t);
    const pid = bystander(t);
    Object.assign(state, {
      namespaces: currentNamespaces(),
      processes: [
        {
          name: "frontend",
          pid,
          startTime: startTimeOf(pid),
          command: "node",
          cwd: state.dir,
          log: join(state.logs, "frontend.log"),
          startedAt: new Date().toISOString(),
        },
      ],
    });
    saveRun(state);
    const recorded = storedRun(state.dir);

    const shifted = spawnSync(
      "unshare",
      [
        "-Ur",
        "--time",
        "--boottime",
        BOOTTIME_OFFSET_S,
        process.execPath,
        CONTROL_BIN,
        "down",
        state.dir,
      ],
      { encoding: "utf8" },
    );
    assert.equal(shifted.status, 1, shifted.stderr);
    assert.match(
      shifted.stderr,
      /this run was started in another time namespace \(run: time:\[\d+\]; here: time:\[\d+\]\); run this command there/,
    );
    assert.equal(storedRun(state.dir), recorded);
    assert.equal(isRunning(pid), true);
  },
);

await test("a run that recorded no namespaces, as an earlier dms-control wrote it, is still stopped by down", async (t) => {
  const state = await newRun(t);
  const pid = bystander(t);
  state.processes = [
    {
      name: "frontend",
      pid,
      startTime: startTimeOf(pid),
      command: "node",
      cwd: state.dir,
      log: join(state.logs, "frontend.log"),
      startedAt: new Date().toISOString(),
    },
  ];
  saveRun(state);
  const down = spawnSync(process.execPath, [CONTROL_BIN, "down", state.dir], {
    encoding: "utf8",
  });
  assert.equal(down.status, 0, down.stderr);
  assert.equal(isRunning(pid), false);
});

await test("mail, timings and api read a run started in another PID namespace; down on that run still refuses and leaves run.json as it was; a version that checks the namespace for every command fails mail, timings and api", async (t) => {
  const state = await newRun(t);
  state.namespaces = { ...currentNamespaces(), pid: "pid:[1]" };
  saveRun(state);
  const recorded = storedRun(state.dir);
  /** @param {string[]} command */
  const run = (...command) =>
    spawnSync(
      process.execPath,
      [CONTROL_BIN, command[0], state.dir, ...command.slice(1)],
      {
        encoding: "utf8",
      },
    );

  const mail = run("mail");
  assert.equal(mail.status, 0, mail.stderr);
  assert.deepEqual(JSON.parse(mail.stdout), []);
  const timings = run("timings");
  assert.equal(timings.status, 0, timings.stderr);
  const api = run("api", "GET", "/api/onboarding/informations", "--as", "anon");
  assert.doesNotMatch(api.stderr, /another PID namespace/);
  assert.match(api.stdout, /ECONNREFUSED/, api.stderr);

  const down = run("down");
  assert.equal(down.status, 1, down.stderr);
  assert.match(
    down.stderr,
    /this run was started in another PID namespace \(run: pid:\[1\]; here: pid:\[\d+\]\); run this command there/,
  );
  assert.equal(storedRun(state.dir), recorded);
});
