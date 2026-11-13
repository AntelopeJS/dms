import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  downloadExportJob,
  getExportJobStatus,
  runExportJob,
} from "@antelopejs/interface-dms/base/export-jobs";
import { httpRejectionOf } from "../../../helpers/http-rejection";
import { untouchedRequestContext } from "../../../helpers/request-context";

const HTTP_UNAUTHORIZED = 401;

const SETTLE_TIMEOUT_MS = 2000;
// SAFETY: runExportJob and loadExportJobForUser, which getExportJobStatus and downloadExportJob call first, assert that user is defined with a 401 before they read any member of it, so an undefined user is rejected and never dereferenced.
const ANONYMOUS_USER = undefined as unknown as User;
const UNUSED_CONTEXT = untouchedRequestContext();
const UNKNOWN_JOB_ID = "unknown-export-job";

async function rejectionOf(call: Promise<unknown>) {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("the call never reached the module")),
      SETTLE_TIMEOUT_MS,
    ).unref();
  });
  return httpRejectionOf(Promise.race([call, timeout]));
}

function expectModuleRejection(error: HTTPResult): void {
  expect(error.getStatus()).to.equal(HTTP_UNAUTHORIZED);
}

describe("[unit] interfaces/dms-base/export-jobs — entry points reach the module", () => {
  it("binds runExportJob", async () => {
    const error = await rejectionOf(
      runExportJob({
        ctx: UNUSED_CONTEXT,
        user: ANONYMOUS_USER,
        scope: "binding-test",
        filename: "binding-test",
        extension: "csv",
        contentType: "text/csv",
        generate: async () => undefined,
      }),
    );
    expectModuleRejection(error);
  });

  it("binds getExportJobStatus", async () => {
    const error = await rejectionOf(
      getExportJobStatus(UNUSED_CONTEXT, ANONYMOUS_USER, UNKNOWN_JOB_ID),
    );
    expectModuleRejection(error);
  });

  it("binds downloadExportJob", async () => {
    const error = await rejectionOf(
      downloadExportJob(UNUSED_CONTEXT, ANONYMOUS_USER, UNKNOWN_JOB_ID),
    );
    expectModuleRejection(error);
  });
});
