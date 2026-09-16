import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import {
  assertOAuthRelay,
  deriveOAuthRelaySecret,
} from "../../routes/auth/oauth/relay";

const HTTP_UNAUTHORIZED = 401;

function expectRefusal(run: () => unknown): void {
  try {
    run();
  } catch (error: unknown) {
    expect(error).to.be.instanceOf(HTTPResult);
    expect((error as HTTPResult).getStatus()).to.equal(HTTP_UNAUTHORIZED);
    expect((error as HTTPResult).getBody()).to.equal(
      "error.oauth.relay_required",
    );
    return;
  }
  expect.fail("expected the relay check to refuse");
}

describe("[unit] oauth relay", () => {
  it("derives a stable secret bound to the instance", () => {
    expect(deriveOAuthRelaySecret()).to.equal(deriveOAuthRelaySecret());
    expect(deriveOAuthRelaySecret()).to.have.length.greaterThan(0);
  });

  it("accepts the derived secret", () => {
    expect(() => assertOAuthRelay(deriveOAuthRelaySecret())).to.not.throw();
  });

  it("refuses a missing header", () => {
    expectRefusal(() => assertOAuthRelay(undefined));
  });

  it("refuses an empty header", () => {
    expectRefusal(() => assertOAuthRelay(""));
  });

  it("refuses a wrong secret", () => {
    expectRefusal(() => assertOAuthRelay("not-the-relay-secret"));
  });

  it("never derives the raw instance secret", () => {
    expect(deriveOAuthRelaySecret()).to.not.contain("test-jwt-secret");
  });
});
