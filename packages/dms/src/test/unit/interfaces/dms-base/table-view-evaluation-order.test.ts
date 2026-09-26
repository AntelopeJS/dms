import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect } from "chai";
import type { EvaluationOrderResult } from "./table-view-evaluation-order.fixture";

const FIXTURE = resolve(__dirname, "table-view-evaluation-order.fixture.js");
const LOCATION = "/api/evaluation-order";
const ROW = "evaluation-order-row";
// A fresh Node process loads the interface and the DMS's realtime modules.
const PROCESS_TIMEOUT_MS = 30_000;

const runProcess = promisify(execFile);

describe("[unit] interfaces/dms-base — table-view realtime and evaluation order", () => {
  it("reaches the DMS when its realtime modules evaluate while table-view is still evaluating", async function () {
    this.timeout(PROCESS_TIMEOUT_MS);
    const { stdout } = await runProcess(process.execPath, [FIXTURE]);
    const result = JSON.parse(stdout) as EvaluationOrderResult;

    expect(result).to.deep.equal({
      published: ["updated"],
      present: [ROW],
      pageTopics: [`tableview:row:${LOCATION}`],
    });
  });
});
