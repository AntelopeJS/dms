import { ExportJobModel } from "@antelopejs/interface-dms/db/internal/exportJobs.model";
import { expect } from "chai";
import { readJobResult } from "../../../utils";

/** A job whose `json_result` column holds `jsonResult`, as a completed job stores it. */
const jobStoring = (jsonResult: string) =>
  ExportJobModel.fromPlainData({ json_result: jsonResult });

describe("[unit] utils/export-jobs — the result summary a job stored", () => {
  it("reads a summary as its export reported it", () => {
    const summary = {
      partial: true,
      failures: [{ source: "billing", error: "timeout" }],
    };

    expect(readJobResult(jobStoring(JSON.stringify(summary)))).to.deep.equal(
      summary,
    );
  });

  it("reads a partial summary without failures as partial, naming none", () => {
    const stored = JSON.stringify({ partial: true });

    expect(readJobResult(jobStoring(stored))).to.deep.equal({
      partial: true,
      failures: [],
    });
  });

  it("reads a summary that does not say it is partial as complete", () => {
    const stored = JSON.stringify({ failures: [] });

    expect(readJobResult(jobStoring(stored))).to.deep.equal({
      partial: false,
      failures: [],
    });
  });

  it("reads a partial summary with incomplete failures as partial, naming each source it can", () => {
    const stored = JSON.stringify({
      partial: true,
      failures: [{ source: "mod-a" }, { error: "timeout" }, "mod-c"],
    });

    expect(readJobResult(jobStoring(stored))).to.deep.equal({
      partial: true,
      failures: [{ source: "mod-a", error: "" }],
    });
  });

  it("reads a summary naming failures as partial when its partial is not a boolean", () => {
    const stored = JSON.stringify({
      partial: "yes",
      failures: [{ source: "billing", error: "timeout" }],
    });

    expect(readJobResult(jobStoring(stored))).to.deep.equal({
      partial: true,
      failures: [{ source: "billing", error: "timeout" }],
    });
  });

  it("reads no summary from a stored value that is not one", () => {
    expect(readJobResult(jobStoring(JSON.stringify("done")))).to.equal(
      undefined,
    );
  });
});
