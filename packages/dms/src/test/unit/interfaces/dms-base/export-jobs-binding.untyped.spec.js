import { expect } from "chai";
import {
  downloadExportJob,
  getExportJobStatus,
  runExportJob,
} from "@antelopejs/interface-dms/base/export-jobs";
import { httpRejectionOf } from "../../../helpers/http-rejection";
import { untouchedRequestContext } from "../../../helpers/request-context";

const HTTP_UNAUTHORIZED = 401;

const SETTLE_TIMEOUT_MS = 2000;
const ANONYMOUS_USER = undefined;
const UNUSED_CONTEXT = untouchedRequestContext();
const UNKNOWN_JOB_ID = "unknown-export-job";

/**
 * @param {Promise<unknown>} call
 */
async function rejectionOf(call) {
  const timeout = new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error("the call never reached the module")),
      SETTLE_TIMEOUT_MS,
    ).unref();
  });
  return httpRejectionOf(Promise.race([call, timeout]));
}

/**
 * @param {{ getStatus(): number }} error
 */
function expectModuleRejection(error) {
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
