import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import { sign } from "jsonwebtoken";
import { getAuthConfig } from "../../index";
import {
  assertValidOAuthState,
  signOAuthState,
} from "../../routes/auth/oauth/state";

const HTTP_BAD_REQUEST = 400;
const INVALID_STATE_MESSAGE = "error.oauth.invalid_state";

function expectRejection(run: () => unknown): void {
  try {
    run();
  } catch (error: unknown) {
    expect(error).to.be.instanceOf(HTTPResult);
    expect((error as HTTPResult).getStatus()).to.equal(HTTP_BAD_REQUEST);
    expect((error as HTTPResult).getBody()).to.equal(INVALID_STATE_MESSAGE);
    return;
  }
  expect.fail("expected the state to be rejected");
}

describe("[unit] oauth state", () => {
  it("accepts the state the browser handed back untouched", () => {
    const state = signOAuthState("github");
    expect(() => assertValidOAuthState(state, state, "github")).to.not.throw();
  });

  it("mints a distinct state per flow", () => {
    expect(signOAuthState("github")).to.not.equal(signOAuthState("github"));
  });

  it("consumes the state: the same state cannot complete two logins", () => {
    const state = signOAuthState("github");
    assertValidOAuthState(state, state, "github");
    expectRejection(() => assertValidOAuthState(state, state, "github"));
  });

  it("rejects a state the browser never stored", () => {
    const state = signOAuthState("github");
    const otherState = signOAuthState("github");
    expectRejection(() => assertValidOAuthState(state, otherState, "github"));
  });

  it("rejects a missing browser state", () => {
    const state = signOAuthState("github");
    expectRejection(() => assertValidOAuthState(state, "", "github"));
  });

  it("rejects a state minted for another provider", () => {
    const state = signOAuthState("google");
    expectRejection(() => assertValidOAuthState(state, state, "github"));
  });

  it("rejects a tampered state", () => {
    const state = `${signOAuthState("github")}tampered`;
    expectRejection(() => assertValidOAuthState(state, state, "github"));
  });

  it("rejects a state signed with the plain instance secret", () => {
    const forged = sign(
      { provider: "github", nonce: "1", purpose: "oauth-state" },
      getAuthConfig().jwtSecret,
    );
    expectRejection(() => assertValidOAuthState(forged, forged, "github"));
  });

  it("rejects a token signed for another purpose", () => {
    const forged = sign(
      { provider: "github", nonce: "1", purpose: "2fa" },
      `oauth-state:${getAuthConfig().jwtSecret}`,
    );
    expectRejection(() => assertValidOAuthState(forged, forged, "github"));
  });
});
