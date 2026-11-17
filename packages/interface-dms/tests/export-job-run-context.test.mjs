import assert from "node:assert/strict";
import test from "node:test";
import { ImplementInterface } from "@antelopejs/interface-core";
import { runExportJob, runExportJobProxy } from "../dist/base/export-jobs.js";

/** @type {Parameters<typeof runExportJobProxy>[0][]} */
const handedToModule = [];
ImplementInterface(
  { runExportJobProxy },
  {
    runExportJobProxy: async (options) => {
      handedToModule.push(options);
      return { jobId: "job-1", extension: "csv", filename: "report" };
    },
  },
);

await test("generate receives the context its caller started the job with", async () => {
  /** @type {unknown[]} */
  const seen = [];
  const context = { since: new Date("2026-01-02T00:00:00.000Z") };
  await runExportJob({
    ctx: {},
    user: { _id: "owner" },
    scope: "report",
    context,
    filename: "report",
    extension: "csv",
    contentType: "text/csv",
    generate: async (job) => {
      seen.push(job.context, job.jobId);
    },
  });
  const handed = handedToModule.at(-1);

  assert.equal(handed?.context, context);
  await handed?.generate({
    jobId: "job-1",
    tenantId: "tenant-1",
    localPath: "unused",
    context: "what the engine read back",
    reportProgress: async () => undefined,
    signal: new AbortController().signal,
  });
  assert.deepEqual(seen, [context, "job-1"]);
});
