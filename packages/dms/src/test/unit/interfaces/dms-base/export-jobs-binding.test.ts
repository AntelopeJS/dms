import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";
import { expect } from "chai";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  downloadExportJob,
  getExportJobStatus,
  runExportJob,
} from "@antelopejs/interface-dms/base/export-jobs";

const HTTP_UNAUTHORIZED = 401;
// Outside the test runner an unbound proxy never settles; inside it, it
// rejects with a missing-provider error. The bound wait covers the first case
// and the status check the second: only the module answers 401.
const SETTLE_TIMEOUT_MS = 2000;
const ANONYMOUS_USER = undefined as unknown as User;
const UNUSED_CONTEXT = {} as RequestContext;
const UNKNOWN_JOB_ID = "unknown-export-job";

async function rejectionOf(call: Promise<unknown>): Promise<unknown> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("the call never reached the module")),
      SETTLE_TIMEOUT_MS,
    ).unref();
  });
  try {
    await Promise.race([call, timeout]);
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to be rejected");
}

function expectModuleRejection(error: unknown): void {
  expect(error).to.be.instanceOf(HTTPResult);
  expect((error as HTTPResult).getStatus()).to.equal(HTTP_UNAUTHORIZED);
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
