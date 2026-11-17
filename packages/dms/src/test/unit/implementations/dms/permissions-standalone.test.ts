import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect } from "chai";
import { z } from "zod";

const FIXTURE = resolve(__dirname, "permissions-standalone.fixture.js");
const PROCESS_TIMEOUT_MS = 30_000;

const runProcess = promisify(execFile);

describe("[unit] implementations/dms/permissions — loaded on its own", () => {
  it("holds only the permissions its consumer registers", async function () {
    this.timeout(PROCESS_TIMEOUT_MS);
    const { stdout } = await runProcess(process.execPath, [FIXTURE]);

    expect(z.array(z.string()).parse(JSON.parse(stdout))).to.deep.equal([
      "consumer",
    ]);
  });
});
