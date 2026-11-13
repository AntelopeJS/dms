import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import test from "node:test";
import { HTTPResult } from "@antelopejs/interface-api";
import { ImplementInterface } from "@antelopejs/interface-core";
import { z } from "zod";
import { User } from "../dist/auth/db/index.js";
import {
  getExportJobStatus,
  getExportJobStatusProxy,
} from "../dist/base/export-jobs.js";
import { ExportJobModel } from "../dist/db/internal/exportJobs.model.js";
import { ExportStatus } from "../dist/export-status.js";

const OWNER = Object.assign(new User(), { _id: "owner" });
const rawRequest = new IncomingMessage(new Socket());
const REQUEST = {
  rawRequest,
  rawResponse: new ServerResponse(rawRequest),
  url: new URL("http://localhost/"),
  routeParameters: {},
  response: new HTTPResult(),
};

/** @type {NonNullable<Parameters<typeof getExportJobStatusProxy>[3]>[]} */
const handedToModule = [];
ImplementInterface(
  { getExportJobStatusProxy },
  {
    getExportJobStatusProxy: async (_ctx, _user, _jobId, access) => {
      if (access) handedToModule.push(access);
      return { status: ExportStatus.pending, progress: 0 };
    },
  },
);

/** @param {string} jsonContext */
const jobStoring = (jsonContext) =>
  ExportJobModel.fromPlainData({ _id: "job-1", json_context: jsonContext });

await test("isOwnedBy reads the stored context as the schema parsed it", async () => {
  /** @type {Date[]} */
  const seen = [];
  await getExportJobStatus(REQUEST, OWNER, "job-1", {
    scope: "report",
    contextSchema: z.object({ since: z.coerce.date() }),
    isOwnedBy: (_record, context) => {
      seen.push(context.since);
      return true;
    },
  });
  const access = handedToModule.at(-1);
  const job = jobStoring(JSON.stringify({ since: "2026-01-02T00:00:00.000Z" }));

  assert.equal(access?.scope, "report");
  assert.equal(access?.isOwnedBy?.(job, OWNER), true);
  assert.deepEqual(seen, [new Date("2026-01-02T00:00:00.000Z")]);
});

await test("a stored context the schema refuses refuses the job without asking isOwnedBy", async () => {
  let asked = false;
  await getExportJobStatus(REQUEST, OWNER, "job-1", {
    contextSchema: z.object({ controllerKey: z.string() }),
    isOwnedBy: () => {
      asked = true;
      return true;
    },
  });
  const access = handedToModule.at(-1);

  assert.equal(access?.isOwnedBy?.(jobStoring("null"), OWNER), false);
  assert.equal(
    access?.isOwnedBy?.(
      jobStoring(JSON.stringify({ controllerKey: 7 })),
      OWNER,
    ),
    false,
  );
  assert.equal(asked, false);
});
