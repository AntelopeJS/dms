const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve, dirname, basename } = require("node:path");

const root = resolve(process.argv[2]);
const script = join(root, "packages/dms/skills/dms-project/scripts/dms-dev.sh");
const fixture = mkdtempSync(join(tmpdir(), "dms-dev-probe-"));
const project = join(fixture, "empty project");
mkdirSync(project);
const bin = join(fixture, "bin directory");
const aliases = join(fixture, "aliases");
mkdirSync(bin);
mkdirSync(aliases);
const absoluteLink = join(bin, "dms-dev");
const relativeLink = join(aliases, "dms-relative");
symlinkSync(script, absoluteLink);
symlinkSync("../bin directory/dms-dev", relativeLink);
writeFileSync(join(project, "package.json"), '{"name":"probe","private":true}');
const backendLog = join(fixture, "backend.log");
const frontendLog = join(fixture, "frontend.log");
writeFileSync(backendLog, Array.from({ length: 67 }, (_, i) => `back-${i}\n`).join(""));
writeFileSync(frontendLog, Array.from({ length: 63 }, (_, i) => `front-${i}\n`).join(""));
const observations = [];
function run(args, expectedStatus, extraEnv = {}, relative = false, executable) {
  const result = spawnSync(executable ?? "bash", executable ? args : [relative ? basename(script) : script, ...args], {
    cwd: relative ? dirname(script) : fixture,
    env: { ...process.env, DMS_BACK_DIR: "", DMS_BACK_LOG: backendLog, DMS_FRONT_LOG: frontendLog, ...extraEnv },
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, expectedStatus, args.join(" "));
  const normalize = text => text.split(fixture).join("<fixture>");
  observations.push({ args, relative, executable: executable ? basename(executable) : null, status: result.status, stdout: normalize(result.stdout), stderr: normalize(result.stderr) });
  return result.stdout;
}
try {
  const help = run(["--help"], 0);
  assert.match(help, /^Usage: dms-dev\.sh <command>\n/);
  for (const args of [[], ["-h"], ["help"]]) assert.equal(run(args, 0), help);
  assert.equal(run(["--help"], 0, {}, true), help);
  assert.equal(run(["unknown"], 2), help);
  for (const link of [absoluteLink, relativeLink]) {
    const linkHelp = help.replace("Usage: dms-dev.sh", `Usage: ${basename(link)}`);
    assert.equal(run(["--help"], 0, {}, false, link), linkHelp);
    assert.equal(run(["-h"], 0, {}, false, link), linkHelp);
    assert.equal(run(["unknown"], 2, {}, false, link), linkHelp);
  }
  assert.equal(run(["--help"], 0, { PATH: `${bin}:${process.env.PATH}` }, false, "dms-dev"), help.replace("Usage: dms-dev.sh", "Usage: dms-dev"));
  for (const command of ["start", "stop", "status", "restart-back", "restart-front"]) {
    assert.match(run([command], 2), /DMS_BACK_DIR is not set/);
  }
  assert.match(run(["status"], 2, { DMS_BACK_DIR: join(fixture, "missing") }), /does not exist/);
  assert.match(run(["status"], 2, { DMS_BACK_DIR: fixture }), /has no package\.json/);
  assert.match(run(["status"], 0, { DMS_BACK_DIR: project }), /\(none\)/);
  assert.match(run(["stop"], 0, { DMS_BACK_DIR: project }), /nothing running\./);
  assert.equal(run(["back-log", "3"], 0), "back-64\nback-65\nback-66\n");
  assert.equal(run(["front-log", "2"], 0), "front-61\nfront-62\n");
  assert.equal(run(["back-log"], 0).split("\n")[0], "back-7");
  assert.equal(run(["front-log"], 0).split("\n")[0], "front-3");
  assert.equal(run(["back-log", "0"], 0), "");
  process.stdout.write(JSON.stringify(observations));
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
