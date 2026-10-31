/**
 * Shared TLC runner for the dms formal checks.
 *
 * Each `.agents/skills/formal-<name>/check.mjs` calls {@link checkSpec}: every
 * INVARIANT of `<spec>.cfg` must hold except the recorded findings, which
 * must still break with a shortest counterexample of exactly the recorded
 * number of states. Exit 0 when TLC agrees, 1 when a rule changed, 2 when TLC
 * could not run.
 *
 * TLC is the pinned tla2tools.jar, downloaded once into
 * `$XDG_CACHE_HOME/antelopejs-formal` (default `~/.cache/antelopejs-formal`)
 * and checked against its SHA-256. Java comes from `$JAVA`, else `java` on
 * PATH, else the `eclipse-temurin:21-jre` Docker image, run with `--rm`.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const TLC_VERSION = "1.7.4";
const TLC_URL = `https://github.com/tlaplus/tlaplus/releases/download/v${TLC_VERSION}/tla2tools.jar`;
const TLC_SHA256 = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88";
const DOCKER_IMAGE = "eclipse-temurin:21-jre";

/** Exit codes shared by every check. */
export const EXIT = { ok: 0, changed: 1, tool: 2 };

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(`check: ${message}`);
  process.exit(EXIT.tool);
}

/** @param {string} file */
function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** Downloads the pinned tla2tools.jar once and returns its path. */
export async function ensureJar() {
  const cacheRoot = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
  const dir = path.join(cacheRoot, "antelopejs-formal");
  const jar = path.join(dir, `tla2tools-${TLC_VERSION}.jar`);
  if (existsSync(jar) && sha256(jar) === TLC_SHA256) {
    return jar;
  }
  mkdirSync(dir, { recursive: true });
  console.log(`Downloading ${TLC_URL}`);
  const response = await fetch(TLC_URL);
  if (!response.ok) {
    fail(`download failed: HTTP ${response.status}`);
  }
  const partial = `${jar}.${process.pid}.part`;
  writeFileSync(partial, Buffer.from(await response.arrayBuffer()));
  const actual = sha256(partial);
  if (actual !== TLC_SHA256) {
    rmSync(partial, { force: true });
    fail(`tla2tools.jar has SHA-256 ${actual}, expected ${TLC_SHA256}`);
  }
  renameSync(partial, jar);
  return jar;
}

/** @param {string} program */
function onPath(program) {
  return spawnSync(program, ["-version"], { stdio: "ignore" }).status === 0;
}

let dockerRuns = 0;

/**
 * The program and leading arguments that run `java`: `$JAVA`, `java` on
 * PATH, or a throwaway container that mounts the jar folder and the work
 * folder at the same paths.
 */
/**
 * @param {string} jar
 * @param {string} work
 */
function javaInvocation(jar, work) {
  if (process.env.JAVA) {
    return { program: process.env.JAVA, prefix: [] };
  }
  if (onPath("java")) {
    return { program: "java", prefix: [] };
  }
  dockerRuns += 1;
  const prefix = process.env.TLC_DOCKER_PREFIX ?? "dms-formal-tlc";
  return {
    program: "docker",
    prefix: [
      "run",
      "--rm",
      "--name",
      `${prefix}-${process.pid}-${dockerRuns}`,
      "--user",
      `${process.getuid()}:${process.getgid()}`,
      "-v",
      `${path.dirname(jar)}:${path.dirname(jar)}:ro`,
      "-v",
      `${work}:${work}`,
      "-w",
      work,
      DOCKER_IMAGE,
      "java",
    ],
  };
}

/**
 * @param {string} dir
 * @param {string} config
 * @param {Record<string, number>} findings
 */
function readConfig(dir, config, findings) {
  const text = readFileSync(path.join(dir, `${config}.cfg`), "utf8");
  const constants = [...text.matchAll(/^\s+(\w+)\s*=\s*(.+?)\s*$/gm)].map(([, name, value]) => `  ${name} = ${value}`);
  const invariants = [...text.matchAll(/^INVARIANT\s+(\w+)/gm)].map(([, name]) => name);
  const bounds = [...text.matchAll(/^(?:CONSTRAINT|ACTION_CONSTRAINT|SYMMETRY|VIEW)\s+\w+\s*$/gm)].map(([line]) => line.trim());
  for (const name of Object.keys(findings)) {
    if (!invariants.includes(name)) {
      fail(`finding ${name} is not an INVARIANT in ${config}.cfg`);
    }
  }
  return { constants, invariants, bounds };
}

/**
 * @param {{ jar: string, work: string, spec: string, name: string, constants: string[], bounds: string[], invariants: string[], workers: string }} run
 */
function runTlc({ jar, work, spec, name, constants, bounds, invariants, workers }) {
  const cfg = path.join(work, `${name}.cfg`);
  writeFileSync(cfg, ["SPECIFICATION Spec", "CONSTANTS", ...constants, ...bounds, ...invariants.map((rule) => `INVARIANT ${rule}`), ""].join("\n"));
  const java = javaInvocation(jar, work);
  const result = spawnSync(
    java.program,
    [...java.prefix, "-XX:+UseParallelGC", "-cp", jar, "tlc2.TLC", "-config", cfg, "-workers", workers, "-deadlock", "-metadir", path.join(work, `states-${name}`), `${spec}.tla`],
    { cwd: work, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  if (result.error) {
    fail(`cannot run ${java.program}: ${result.error.message}`);
  }
  const output = `${result.stdout}${result.stderr}`;
  writeFileSync(path.join(work, `${name}.out`), output);
  const violated = output.match(/Invariant (\w+) is violated/)?.[1];
  const distinct = output.match(/([\d,]+) distinct states found, 0 states left/)?.[1];
  if (!violated && !output.includes("No error has been found")) {
    fail(`TLC did not finish ${name}; output in ${path.join(work, `${name}.out`)}\n${output.slice(-2000)}`);
  }
  const steps = [...output.matchAll(/^State \d+: <(\w+)/gm)].map(([, action]) => action);
  return { violated, distinct, steps };
}

/**
 * Model-checks `<dir>/<spec>.tla` with the constants and invariants of
 * `<config>.cfg` (default `<spec>.cfg`). Every invariant must hold except
 * those in `findings`, each of which must break with a shortest
 * counterexample of exactly the recorded number of states. Prints one line
 * per rule and exits with {@link EXIT}.
 */
/**
 * @param {{ dir: string, spec: string, config?: string, findings: Record<string, number> }} options
 */
export async function checkSpec({ dir, spec, config = spec, findings }) {
  const { constants, invariants, bounds } = readConfig(dir, config, findings);
  const jar = await ensureJar();
  const work = mkdtempSync(path.join(os.tmpdir(), `formal-${spec}-`));
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".tla"))) {
    copyFileSync(path.join(dir, file), path.join(work, file));
  }
  const holding = invariants.filter((rule) => !Object.hasOwn(findings, rule));
  console.log(`TLC ${TLC_VERSION} on ${spec}.tla (${config}.cfg) with ${constants.map((line) => line.trim()).join(", ")}`);
  let changed = false;
  if (holding.length > 0) {
    const held = runTlc({ jar, work, spec, name: "holds", constants, bounds, invariants: holding, workers: "auto" });
    if (held.violated) {
      changed = true;
      console.log(`BROKEN ${held.violated}: ${held.steps.join(" -> ")}`);
    } else {
      console.log(`holds  ${holding.join(", ")} (${held.distinct} states)`);
    }
  }
  for (const [rule, expected] of Object.entries(findings)) {
    const found = runTlc({ jar, work, spec, name: rule, constants, bounds, invariants: [rule], workers: "1" });
    if (!found.violated) {
      changed = true;
      console.log(`HOLDS  ${rule}: the finding is gone (${found.distinct} states)`);
      continue;
    }
    const length = found.steps.length;
    const tag = length === expected ? "finding" : "CHANGED";
    changed ||= length !== expected;
    console.log(`${tag} ${rule}: ${length} states (recorded ${expected}): ${found.steps.join(" -> ")}`);
  }
  if (changed) {
    console.log(`TLC output kept in ${work}`);
    process.exit(EXIT.changed);
  }
  rmSync(work, { recursive: true, force: true });
  console.log("Every rule matches the record in SKILL.md.");
}
