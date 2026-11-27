import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { restartablePort } from "./processes.mjs";
import { reservedPorts } from "./reserved-ports.mjs";
import { assertFrontendBound } from "./frontend-bound.mjs";

const LAST_PORT = 65535;
const DRAWS = 64;

await test("a restartable port is never one of the reserved ports", async () => {
  const reserved = [];
  for (let port = 1; port <= LAST_PORT; port += 2) reserved.push(port);
  for (let draw = 0; draw < DRAWS; draw += 1) {
    assert.equal((await restartablePort(reserved)) % 2, 0);
  }
  await assert.rejects(
    restartablePort(Array.from({ length: LAST_PORT }, (_, i) => i + 1)),
  );
});

await test("the reserved ports of a run are its three ports and its recorded processes' ports", () => {
  assert.deepEqual(
    reservedPorts({
      apiPort: 1,
      webPort: 2,
      smtpPort: 3,
      processes: [{ port: 4 }, {}],
    }),
    [1, 2, 3, 4],
  );
  assert.deepEqual(reservedPorts({ mongo: "m" }), []);
});

await test("a dashboard whose log says its port is in use fails the run start", (t) => {
  const folder = mkdtempSync(join(tmpdir(), "dms-e2e-frontend-bound-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const bound = join(folder, "bound.log");
  const taken = join(folder, "taken.log");
  writeFileSync(bound, "Listening on http://127.0.0.1:26481\n");
  writeFileSync(taken, "ERROR Port 26481 is already in use\n");
  assertFrontendBound({ log: bound });
  assert.throws(
    () => assertFrontendBound({ log: taken }),
    /Port 26481 is already in use/,
  );
});
