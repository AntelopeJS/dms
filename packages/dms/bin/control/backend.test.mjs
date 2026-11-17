import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { platform } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { freshDatabase, restartBackend } from "./backend.mjs";
import { doctor } from "./doctor.mjs";
import {
  buildFiles,
  bystander,
  dropped,
  newRun,
  rebuild,
  running,
  served,
  startedOn,
} from "./helpers/fake-run.mjs";
import { isRunning } from "./identity.mjs";
import { loadRun, saveRun } from "./run-state.mjs";
import { down, liveBackends } from "./stack.mjs";

await test("each fresh database is served by a backend that served nothing before, and the one it replaces is gone", async (t) => {
  const state = await newRun(t);
  /** @type {number[]} */
  const servers = [];
  for (const suffix of ["j001", "j002", "j003"]) {
    state.accounts = { admin: { email: "admin@example.com" } };
    state.tokens = { admin: "a session of the previous database" };
    const database = await freshDatabase(state, suffix);
    const answer = await served(state);
    const saved = loadRun(state.dir);
    assert.equal(database, `${state.databasePrefix}_${suffix}`);
    assert.deepEqual([saved.accounts, saved.tokens], [{}, {}]);
    assert.deepEqual(answer, { pid: answer.pid, database });
    assert.equal(servers.includes(answer.pid), false);
    assert.deepEqual(servers.filter(isRunning), []);
    servers.push(answer.pid);
  }
});

await test("the next journey's backend already runs when a fresh database is ready, and takes over the next call", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  assert.equal(isRunning(standby.pid), true);
  await freshDatabase(state, "j002");
  assert.deepEqual(await served(state), {
    pid: standby.pid,
    database: `${state.databasePrefix}_j002`,
  });
});

await test("a standby started for another database is killed and its database dropped", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  await freshDatabase(state, "r1");
  const answer = await served(state);
  assert.equal(answer.database, `${state.databasePrefix}_r1`);
  assert.notEqual(answer.pid, standby.pid);
  assert.equal(isRunning(standby.pid), false);
  assert.deepEqual(dropped().toSorted(), [
    `${state.databasePrefix}_j001`,
    `${state.databasePrefix}_j002`,
  ]);
});

await test("a database without standby is served by a backend started for it, not the standby booted before it, and no standby boots while it is used; the next database gets one again", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  await freshDatabase(state, "j002", { standby: false });
  const answer = await served(state);
  assert.equal(answer.database, `${state.databasePrefix}_j002`);
  assert.notEqual(answer.pid, standby.pid);
  assert.equal(isRunning(standby.pid), false);
  assert.deepEqual(
    liveBackends(state).map((backend) => backend.pid),
    [answer.pid],
  );
  await freshDatabase(state, "j003");
  const next = await startedOn(`${state.databasePrefix}_j004`);
  assert.equal(isRunning(next.pid), true);
});

await test("a standby that died is replaced by a backend started on the spot", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  process.kill(standby.pid, "SIGKILL");
  await freshDatabase(state, "j002");
  const answer = await served(state);
  assert.equal(answer.database, `${state.databasePrefix}_j002`);
  assert.notEqual(answer.pid, standby.pid);
});

await test("a restart inside a journey keeps its database, and the next journey still gets its standby", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  const first = await served(state);
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  await restartBackend(state);
  const restarted = await served(state);
  assert.equal(restarted.database, `${state.databasePrefix}_j001`);
  assert.notEqual(restarted.pid, first.pid);
  assert.equal(isRunning(first.pid), false);
  await freshDatabase(state, "j002");
  assert.deepEqual(await served(state), {
    pid: standby.pid,
    database: `${state.databasePrefix}_j002`,
  });
});

await test("down stops the standby with the rest of the run", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  await down(state);
  assert.equal(isRunning(standby.pid), false);
});

await test("a standby started before a build is not used, whichever build input changed, and one started after it takes over", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  const files = buildFiles(dirname(state.playground));
  for (const [index, file] of files.entries()) {
    const database = `${state.databasePrefix}_j00${index + 2}`;
    const standby = await startedOn(database);
    rebuild(file);
    await freshDatabase(state, `j00${index + 2}`);
    const answer = await served(state);
    assert.equal(answer.database, database);
    assert.notEqual(
      answer.pid,
      standby.pid,
      `${file} changed after it started`,
    );
    assert.equal(isRunning(standby.pid), false);
  }
  const fresh = await startedOn(
    `${state.databasePrefix}_j00${files.length + 2}`,
  );
  await freshDatabase(state, `j00${files.length + 2}`);
  assert.equal((await served(state)).pid, fresh.pid);
});

await test("doctor fails while the backend behind the API started before the last build", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  const check = async () =>
    (await doctor(state)).find(
      (line) => line.check === "backend started after the last build",
    )?.ok;
  assert.equal(await check(), true);
  rebuild(join(state.moduleRoot, "dist/index.js"));
  assert.equal(await check(), false);
  await freshDatabase(state, "j002");
  assert.equal(await check(), true);
});

await test("while a build folder is missing, a fresh database refuses before it stops anything, and doctor fails", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  const serving = await served(state);
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  const dist = join(state.moduleRoot, "dist");
  renameSync(dist, `${dist}.away`);
  await assert.rejects(freshDatabase(state, "j002"), (error) => {
    assert.ok(error instanceof Error && error.message.includes(dist));
    return true;
  });
  assert.deepEqual(await served(state), serving);
  assert.equal(isRunning(standby.pid), true);
  const build = (await doctor(state)).find(
    (line) => line.check === "backend started after the last build",
  );
  assert.equal(build?.ok, false);
});

await test(
  "a build folder that cannot be read keeps a standby from being used; a version that counts what it cannot read as unchanged uses it",
  {
    skip:
      (process.getuid?.() === 0 && "root reads a folder whatever its mode") ||
      (platform() === "win32" && "Windows reads a folder whatever its mode"),
  },
  async (t) => {
    const state = await newRun(t);
    const locked = join(state.moduleRoot, "dist/locked");
    mkdirSync(locked);
    chmodSync(locked, 0);
    try {
      await freshDatabase(state, "j001");
      const standby = await startedOn(`${state.databasePrefix}_j002`);
      await freshDatabase(state, "j002");
      assert.notEqual((await served(state)).pid, standby.pid);
    } finally {
      chmodSync(locked, 0o700);
    }
  },
);

await test("a link to nothing in a build folder, there before the standby started, does not keep the standby from being used; a version that counts it as missing starts a backend for every journey", async (t) => {
  const state = await newRun(t);
  symlinkSync(
    join(state.moduleRoot, "removed.js"),
    join(state.moduleRoot, "dist/dangling.js"),
  );
  await freshDatabase(state, "j001");
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  await freshDatabase(state, "j002");
  assert.equal((await served(state)).pid, standby.pid);
  const build = (await doctor(state)).find(
    (line) => line.check === "backend started after the last build",
  );
  assert.equal(build?.ok, true, build?.detail);
});

await test("a standby started before a build is not used when an older build is moved into place, a file copied with its old times, or the build rewritten behind a link", async (t) => {
  const state = await newRun(t);
  const parent = state.moduleRoot;
  const build = join(state.playground, ".antelope/build");
  cpSync(build, `${build}.old`, { recursive: true, preserveTimestamps: true });
  const older = join(parent, "older.js");
  writeFileSync(older, "an older build\n");
  const { mtime } = statSync(older);
  renameSync(join(parent, "dist"), join(parent, "dist-real"));
  symlinkSync(join(parent, "dist-real"), join(parent, "dist"));
  const interfaceFile = join(parent, "interface/dist/index.js");
  const changes = {
    "an older build moved into place": () => {
      rmSync(build, { recursive: true });
      renameSync(`${build}.old`, build);
    },
    "a file copied with its old times": () => {
      copyFileSync(older, interfaceFile);
      utimesSync(interfaceFile, mtime, mtime);
    },
    "a file rewritten behind a linked dist": () =>
      writeFileSync(join(parent, "dist-real/index.js"), "rewritten\n"),
  };
  await freshDatabase(state, "j001");
  for (const [index, [change, apply]] of Object.entries(changes).entries()) {
    const suffix = `j00${index + 2}`;
    const standby = await startedOn(`${state.databasePrefix}_${suffix}`);
    apply();
    await freshDatabase(state, suffix);
    assert.notEqual((await served(state)).pid, standby.pid, change);
  }
});

await test("a build folder linked to a folder a build removed counts as missing, and doctor fails; a version that counts that link by its own times passes it", async (t) => {
  const state = await newRun(t);
  const dist = join(state.moduleRoot, "dist");
  renameSync(dist, `${dist}-real`);
  symlinkSync(`${dist}-real`, dist);
  await freshDatabase(state, "j001");
  rmSync(`${dist}-real`, { recursive: true });
  const build = (await doctor(state)).find(
    (line) => line.check === "backend started after the last build",
  );
  assert.equal(build?.ok, false);
  assert.ok(build?.detail.startsWith(`${dist} is missing`), build?.detail);
});

await test("a build folder that a later build creates keeps a standby started before it from being used", async (t) => {
  const state = await newRun(t);
  const created = join(state.playground, "dist");
  rmSync(created, { recursive: true });
  state.buildRoots = state.buildRoots?.filter((folder) => folder !== created);
  await freshDatabase(state, "j001");
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  rebuild(join(created, "index.js"));
  await freshDatabase(state, "j002");
  assert.notEqual((await served(state)).pid, standby.pid);
});

await test("a command that saves a run.json it loaded before a fresh database loses no backend", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  const stale = loadRun(state.dir);
  await freshDatabase(state, "j002");
  saveRun(stale);
  const standby = await startedOn(`${state.databasePrefix}_j003`);
  await freshDatabase(loadRun(state.dir), "j003");
  assert.equal((await served(state)).pid, standby.pid);
  const next = await startedOn(`${state.databasePrefix}_j004`);
  assert.deepEqual(
    running(),
    [standby.pid, next.pid].toSorted((a, b) => a - b),
  );
  saveRun(stale);
  await down(loadRun(state.dir));
  assert.deepEqual(running(), []);
});

await test("with no standby, no backend runs ahead and each fresh database starts its own", async (t) => {
  const state = await newRun(t);
  state.noStandby = true;
  await freshDatabase(state, "j001");
  const first = await served(state);
  assert.deepEqual(
    liveBackends(state).map((backend) => backend.pid),
    [first.pid],
  );
  await freshDatabase(state, "j002");
  const second = await served(state);
  assert.notEqual(second.pid, first.pid);
  assert.deepEqual(
    liveBackends(state).map((backend) => backend.pid),
    [second.pid],
  );
});

await test("a run whose backend holds the API port itself is refused before any backend starts", async (t) => {
  const state = await newRun(t);
  const old = bystander(t);
  state.processes = [
    {
      name: "backend",
      pid: old,
      command: "an earlier dms-control's backend",
      cwd: state.dir,
      log: join(state.logs, "backend.log"),
      startedAt: new Date().toISOString(),
      port: state.apiPort,
    },
  ];
  await assert.rejects(freshDatabase(state, "r1"), {
    message: "this run was started by an older dms-control; run `up` again",
  });
  assert.deepEqual(liveBackends(state), []);
  assert.equal(isRunning(old), true);
  state.processes = [];
});
