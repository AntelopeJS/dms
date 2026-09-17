import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import {
  assertFrontendBootstrap,
  decideLayerAccess,
  matchesFrontendBootstrap,
  resolveBootstrapOutcome,
} from "../../implementations/dms/frontend-bootstrap";

const HTTP_UNAUTHORIZED = 401;
const SECRET = "a-configured-bootstrap-secret";

function expectRefusal(run: () => unknown): void {
  try {
    run();
  } catch (error: unknown) {
    expect(error).to.be.instanceOf(HTTPResult);
    expect((error as HTTPResult).getStatus()).to.equal(HTTP_UNAUTHORIZED);
    expect((error as HTTPResult).getBody()).to.equal(
      "error.frontend.bootstrap_required",
    );
    return;
  }
  expect.fail("expected the bootstrap check to refuse");
}

describe("[unit] frontend bootstrap", () => {
  it("accepts the exact credential", () => {
    expect(matchesFrontendBootstrap(SECRET, SECRET)).to.equal(true);
  });

  it("refuses a missing credential", () => {
    expect(matchesFrontendBootstrap(undefined, SECRET)).to.equal(false);
  });

  it("refuses an empty credential", () => {
    expect(matchesFrontendBootstrap("", SECRET)).to.equal(false);
  });

  it("refuses an unrelated credential", () => {
    expect(matchesFrontendBootstrap("something-else", SECRET)).to.equal(false);
  });

  it("refuses a prefix of the credential", () => {
    expect(matchesFrontendBootstrap(SECRET.slice(0, -1), SECRET)).to.equal(
      false,
    );
  });

  it("refuses the credential with a suffix appended", () => {
    expect(matchesFrontendBootstrap(`${SECRET}x`, SECRET)).to.equal(false);
  });

  it("refuses every caller when no credential is configured", () => {
    expect(matchesFrontendBootstrap("", undefined)).to.equal(false);
    expect(matchesFrontendBootstrap(undefined, undefined)).to.equal(false);
    expect(matchesFrontendBootstrap("anything", undefined)).to.equal(false);
  });

  it("reports an unauthenticated caller as anonymous", () => {
    expect(resolveBootstrapOutcome(undefined)).to.equal("anonymous");
    expect(resolveBootstrapOutcome("wrong")).to.equal("anonymous");
  });

  it("lets an authenticated caller through the gate", () => {
    expect(() => assertFrontendBootstrap("authenticated")).to.not.throw();
  });

  it("refuses an anonymous caller at the gate", () => {
    expectRefusal(() => assertFrontendBootstrap("anonymous"));
  });

  describe("layer access decision", () => {
    it("lets an authenticated caller through whatever is configured", () => {
      expect(decideLayerAccess("authenticated", true, "enforce")).to.equal(
        "allow",
      );
      expect(decideLayerAccess("authenticated", true, "warn")).to.equal(
        "allow",
      );
      expect(decideLayerAccess("authenticated", false, "warn")).to.equal(
        "allow",
      );
      expect(decideLayerAccess("authenticated", false, "enforce")).to.equal(
        "allow",
      );
    });

    it("refuses an anonymous caller as soon as a secret is configured", () => {
      expect(decideLayerAccess("anonymous", true, "enforce")).to.equal(
        "refuse",
      );
    });

    it("refuses an anonymous caller even when requireBootstrap says warn", () => {
      expect(decideLayerAccess("anonymous", true, "warn")).to.equal("refuse");
    });

    it("degrades an anonymous caller when no secret is configured", () => {
      expect(decideLayerAccess("anonymous", false, "warn")).to.equal("degrade");
    });

    it("refuses an anonymous caller when enforcement is asked for without a secret", () => {
      expect(decideLayerAccess("anonymous", false, "enforce")).to.equal(
        "refuse",
      );
    });
  });
});
