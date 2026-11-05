import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const script = join(
  import.meta.dirname,
  "../skills/dms-project/scripts/dms-dev.sh",
);

const STUB = `import { mkdirSync, writeFileSync } from "node:fs";
const role = process.argv[2];
const port = process.env.PORT ?? "unset";
if (role === "back" && process.env.PORT) {
  mkdirSync(".antelope", { recursive: true });
  writeFileSync(".antelope/dev.json", JSON.stringify({
    pid: process.pid,
    servers: { api: { endpoints: [{ host: "localhost", port: process.env.PORT }] } },
  }));
}
console.log(role === "back" ? "Server started, listening" : "Server ready on");
console.log("PORT=" + port);
console.log("PROJECT=" + process.cwd());
setInterval(() => {}, 1_000_000);
`;

/**
 * @param {import("node:test").TestContext} t
 * @returns {{ stub: string, project: () => string }} A stub server and a factory for throwaway projects that `stop` and delete themselves
 */
function fixture(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "dms-dev-test-")));
  const stub = join(base, "stub.mjs");
  writeFileSync(stub, STUB);
  /** @type {string[]} */
  const projects = [];
  t.after(() => {
    for (const root of projects) {
      spawnSync("bash", [script, "stop"], {
        env: environment({ DMS_BACK_DIR: root }),
      });
    }
    rmSync(base, { recursive: true, force: true });
  });
  return {
    stub,
    project() {
      const root = join(base, `project-${projects.length}`);
      mkdirSync(root);
      writeFileSync(
        join(root, "package.json"),
        '{"name":"stub","private":true}',
      );
      projects.push(root);
      return root;
    },
  };
}

/**
 * @param {Record<string, string>} [extra]
 * @returns {NodeJS.ProcessEnv} The test process environment without anything the script reads
 */
function environment(extra = {}) {
  const env = { ...process.env };
  for (const name of [
    "PORT",
    "DMS_BACK_PORT",
    "DMS_FRONT_PORT",
    "DMS_BACK_LOG",
    "DMS_FRONT_LOG",
  ])
    delete env[name];
  return { ...env, DMS_DEV_TIMEOUT: "30", DMS_DEV_STOP_GRACE: "2", ...extra };
}

/**
 * @param {string} stub
 * @param {string} root
 * @param {Record<string, string>} extra
 * @returns {NodeJS.ProcessEnv} The environment of one script call against the project at `root`
 */
function scriptEnv(stub, root, extra) {
  return environment({
    DMS_BACK_DIR: root,
    DMS_BACK_CMD: `${process.execPath} ${stub} back`,
    DMS_FRONT_CMD: `${process.execPath} ${stub} front`,
    ...extra,
  });
}

/**
 * @param {string} root
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} args
 * @returns {Promise<string>} What the script printed
 */
async function dmsDev(root, env, args) {
  const { stdout } = await run("bash", [script, ...args], { cwd: root, env });
  return stdout;
}

await test("two projects started at once keep their own PORT and logs (fails a shared fixed log file)", async (t) => {
  const { stub, project } = fixture(t);
  const [one, two] = [project(), project()];
  const envOne = scriptEnv(stub, one, {
    DMS_BACK_PORT: "24101",
    DMS_FRONT_PORT: "24102",
  });
  const envTwo = scriptEnv(stub, two, {
    DMS_BACK_PORT: "24201",
    DMS_FRONT_PORT: "24202",
  });

  const [startOne, startTwo] = await Promise.all([
    dmsDev(one, envOne, ["start"]),
    dmsDev(two, envTwo, ["start"]),
  ]);

  assert.match(startOne, /backend ready on http:\/\/localhost:24101\./);
  assert.match(startOne, /frontend ready on http:\/\/localhost:24102 /);
  assert.match(startTwo, /backend ready on http:\/\/localhost:24201\./);
  assert.match(startTwo, /frontend ready on http:\/\/localhost:24202 /);

  const logs = {
    backOne: await dmsDev(one, envOne, ["back-log"]),
    frontOne: await dmsDev(one, envOne, ["front-log"]),
    backTwo: await dmsDev(two, envTwo, ["back-log"]),
    frontTwo: await dmsDev(two, envTwo, ["front-log"]),
  };
  assert.equal(
    logs.backOne,
    `Server started, listening\nPORT=24101\nPROJECT=${one}\n`,
  );
  assert.equal(logs.frontOne, `Server ready on\nPORT=24102\nPROJECT=${one}\n`);
  assert.equal(
    logs.backTwo,
    `Server started, listening\nPORT=24201\nPROJECT=${two}\n`,
  );
  assert.equal(logs.frontTwo, `Server ready on\nPORT=24202\nPROJECT=${two}\n`);
  assert.match(
    await dmsDev(one, envOne, ["status"]),
    new RegExp(
      `${one}/\\.antelope/logs/back\\.log, ${one}/\\.antelope/logs/front\\.log`,
    ),
  );
});

await test("a backend port alone leaves the frontend child without PORT (fails a PORT exported shell-wide)", async (t) => {
  const { stub, project } = fixture(t);
  const root = project();
  const env = scriptEnv(stub, root, { DMS_BACK_PORT: "24301" });

  await dmsDev(root, env, ["start"]);

  assert.equal(
    await dmsDev(root, env, ["back-log"]),
    `Server started, listening\nPORT=24301\nPROJECT=${root}\n`,
  );
  assert.equal(
    await dmsDev(root, env, ["front-log"]),
    `Server ready on\nPORT=unset\nPROJECT=${root}\n`,
  );
});

await test("without the port variables no PORT is set and the URL default stays (fails PORT set to an empty string)", async (t) => {
  const { stub, project } = fixture(t);
  const root = project();
  const env = scriptEnv(stub, root, {});

  const started = await dmsDev(root, env, ["restart-front"]);

  assert.match(started, /frontend ready on http:\/\/localhost:3001 \(assumed/);
  assert.equal(
    await dmsDev(root, env, ["front-log"]),
    `Server ready on\nPORT=unset\nPROJECT=${root}\n`,
  );
});

await test("DMS_FRONT_LOG overrides the per-project default log (fails a default that ignores it)", async (t) => {
  const { stub, project } = fixture(t);
  const root = project();
  const custom = join(root, "custom", "front.log");
  const env = scriptEnv(stub, root, { DMS_FRONT_LOG: custom });

  await dmsDev(root, env, ["restart-front"]);

  assert.equal(
    await dmsDev(root, env, ["front-log"]),
    `Server ready on\nPORT=unset\nPROJECT=${root}\n`,
  );
  assert.ok((await dmsDev(root, env, ["status"])).includes(custom));
});
