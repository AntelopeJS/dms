import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect } from "chai";
import { parseEvaluationOrderResult } from "../../../helpers/evaluation-order-result";

const FIXTURE = resolve(__dirname, "table-view-evaluation-order.fixture.js");
const LOCATION = "/api/evaluation-order";
const ROW = "evaluation-order-row";

const PROCESS_TIMEOUT_MS = 30_000;

const runProcess = promisify(execFile);

describe("[unit] interfaces/dms-base — table-view realtime and evaluation order", () => {
  it("reaches the DMS when its realtime modules evaluate while table-view is still evaluating", async function () {
    this.timeout(PROCESS_TIMEOUT_MS);
    const { stdout } = await runProcess(process.execPath, [FIXTURE]);
    const result = parseEvaluationOrderResult(stdout);

    expect(result).to.deep.equal({
      published: ["updated"],
      present: [ROW],
      pageTopics: [`tableview:row:${LOCATION}`],
    });
  });
});
