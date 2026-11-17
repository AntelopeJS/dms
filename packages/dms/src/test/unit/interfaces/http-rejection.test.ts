import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import { httpRejectionOf } from "../../helpers/http-rejection";

const HTTP_FORBIDDEN = 403;
const FAILURE = "not an http result";

describe("[unit] helpers/http-rejection — httpRejectionOf", () => {
  it("answers the HTTPResult the call rejects with", async () => {
    const refusal = new HTTPResult(HTTP_FORBIDDEN);
    expect(await httpRejectionOf(Promise.reject(refusal))).to.equal(refusal);
  });

  it("fails when the call resolves", async () => {
    let failure: unknown;
    try {
      await httpRejectionOf(Promise.resolve("fine"));
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).to.be.instanceOf(Error);
  });

  it("rethrows a rejection that is not an HTTPResult", async () => {
    let failure: unknown;
    try {
      await httpRejectionOf(Promise.reject(new Error(FAILURE)));
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).to.be.instanceOf(Error);
    expect(failure instanceof Error && failure.message).to.equal(FAILURE);
  });
});
