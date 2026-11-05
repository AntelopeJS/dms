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
const READY = {
  back: "Server started, listening",
  fallback: "[WARN] Port 24401 in use, listening on http://127.0.0.1:24402 instead. Set strictPort: true in the server config to fail instead of falling back.",
  front: "Server ready on",
};
console.log(READY[role]);
console.log("PORT=" + port);
console.log("PROJECT=" + process.cwd());
setInterval(() => {}, 1_000_000);
`;

const LOADING_STUB = `import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
const [role, refusals] = [process.argv[2], Number(process.argv[3])];
if (role === "front") {
  const state = await fetch("http://localhost:" + process.env.DMS_BACK_PORT + "/state");
  console.log("Server ready on");
  console.log("manifest " + (await state.text()));
} else {
  let requests = 0;
  const manifest = "/dms/frontend?renderer=vue&rendererVersion=3";
  createServer((req, res) => {
    const served = req.url === manifest && ++requests > refusals;
    if (req.url === "/state") res.end(requests > refusals ? "served" : "loading");
    else {
      res.statusCode = served ? 200 : req.url === manifest ? 503 : 404;
      res.end("{}");
    }
  }).listen(Number(process.env.PORT), () => {
    mkdirSync(".antelope", { recursive: true });
    writeFileSync(".antelope/dev.json", JSON.stringify({
      pid: process.pid,
      servers: { api: { endpoints: [{ host: "localhost", port: process.env.PORT }] } },
    }));
    console.log("Server started, listening");
  });
}
setInterval(() => {}, 1_000_000);
`;

/**
 * @param {import("node:test").TestContext} t
 * @returns {{ stub: string, loading: string, project: () => string }} Stub servers and a factory for throwaway projects that `stop` and delete themselves
 */
function fixture(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "dms-dev-test-")));
  const stub = join(base, "stub.mjs");
  writeFileSync(stub, STUB);
  const loading = join(base, "loading.mjs");
  writeFileSync(loading, LOADING_STUB);
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
    loading,
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

await test("a backend that fell back to another port is ready and reported there (fails a ready pattern without the fallback line)", async (t) => {
  const { stub, project } = fixture(t);
  const root = project();
  const env = scriptEnv(stub, root, {
    DMS_BACK_CMD: `${process.execPath} ${stub} fallback`,
  });

  const started = await dmsDev(root, env, ["start"]);

  assert.match(started, /backend ready on http:\/\/127\.0\.0\.1:24402\./);
  assert.match(started, /frontend ready on/);
});

await test("the dashboard starts only once the backend serves its manifest (fails starting it on the first ready line)", async (t) => {
  const { loading, project } = fixture(t);
  const root = project();
  const env = scriptEnv(loading, root, {
    DMS_BACK_PORT: "24601",
    DMS_BACK_CMD: `${process.execPath} ${loading} back 2`,
    DMS_FRONT_CMD: `${process.execPath} ${loading} front`,
  });

  await dmsDev(root, env, ["start"]);

  assert.match(await dmsDev(root, env, ["front-log"]), /^manifest served$/m);
});

await test("a backend that never serves its manifest fails the start and leaves the dashboard off (fails starting it anyway)", async (t) => {
  const { loading, project } = fixture(t);
  const root = project();
  const env = scriptEnv(loading, root, {
    DMS_BACK_PORT: "24602",
    DMS_DEV_TIMEOUT: "2",
    DMS_BACK_CMD: `${process.execPath} ${loading} back 1000000`,
    DMS_FRONT_CMD: `${process.execPath} ${loading} front`,
  });

  await assert.rejects(dmsDev(root, env, ["start"]), {
    stdout:
      /^(?![\s\S]*starting frontend)[\s\S]*FAILED TO START: backend — .*\/dms\/frontend\?renderer=vue&rendererVersion=3 still answered 503 after 2s[\s\S]*Server started, listening/,
  });
});
