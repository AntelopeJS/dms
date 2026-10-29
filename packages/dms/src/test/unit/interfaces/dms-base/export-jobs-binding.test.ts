import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  downloadExportJob,
  getExportJobStatus,
  runExportJob,
} from "@antelopejs/interface-dms/base/export-jobs";
import { untouchedRequestContext } from "../../../helpers/request-context";

const HTTP_UNAUTHORIZED = 401;

const SETTLE_TIMEOUT_MS = 2000;
// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The unauthenticated caller is intentionally outside the public User contract so the runtime's unauthorized rejection is exercised.
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
  try {
    await Promise.race([call, timeout]);
  } catch (error: PromiseRejectedResult["reason"]) {
    return error;
  }
  throw new Error("expected the call to be rejected");
}

function expectModuleRejection(
  error: Awaited<ReturnType<typeof rejectionOf>>,
): void {
  expect(error).to.be.instanceOf(HTTPResult);
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
