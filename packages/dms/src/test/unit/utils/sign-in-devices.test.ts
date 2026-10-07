import type { ParsedUserAgent } from "@antelopejs/interface-dms/auth/internal/user-agent";
import { expect } from "chai";
import {
  classifySignIn,
  describeSignInDevice,
  type SignInHistory,
} from "../../../utils/sign-in-devices";

function agent(overrides: Partial<ParsedUserAgent> = {}): ParsedUserAgent {
  return {
    browserName: "Chrome",
    browserVersion: "140.0",
    osName: "Windows",
    osVersion: "10",
    deviceType: "desktop",
    ...overrides,
  };
}

function fingerprintOf(overrides: Partial<ParsedUserAgent> = {}): string {
  return describeSignInDevice(agent(overrides)).fingerprint;
}

const NO_HISTORY: SignInHistory = {
  knownFingerprints: [],
  sessionFingerprints: [],
  hasBeenActive: false,
};

describe("[unit] utils/sign-in-devices", () => {
  describe("describeSignInDevice", () => {
    it("ignores versions, so an update is the same device", () => {
      expect(
        fingerprintOf({ browserVersion: "141.0", osVersion: "11" }),
      ).to.equal(fingerprintOf());
    });

    it("tells browsers, systems and device types apart", () => {
      const base = fingerprintOf();
      expect(fingerprintOf({ browserName: "Firefox" })).to.not.equal(base);
      expect(fingerprintOf({ osName: "macOS" })).to.not.equal(base);
      expect(fingerprintOf({ deviceType: "mobile" })).to.not.equal(base);
    });

    it("names the browser and the system for the alert", () => {
      expect(describeSignInDevice(agent())).to.include({
        browser: "Chrome",
        os: "Windows",
      });
    });

    it("gives an unparseable agent empty names and one stable fingerprint", () => {
      const unknown = { browserName: "", osName: "" };
      const device = describeSignInDevice(agent(unknown));
      expect(device).to.include({ browser: "", os: "" });
      expect(fingerprintOf(unknown)).to.equal(device.fingerprint);
    });
  });

  describe("classifySignIn (known-device rule)", () => {
    const chrome = fingerprintOf();
    const firefox = fingerprintOf({ browserName: "Firefox" });

    it("stays quiet for a remembered device", () => {
      const history = {
        ...NO_HISTORY,
        knownFingerprints: [chrome],
        hasBeenActive: true,
      };
      expect(classifySignIn(chrome, history)).to.equal("known");
    });

    it("stays quiet for the device of a session still open", () => {
      const history = {
        ...NO_HISTORY,
        sessionFingerprints: [chrome],
        hasBeenActive: true,
      };
      expect(classifySignIn(chrome, history)).to.equal("known");
    });

    it("treats the first sign-in of a new account as the first, not a new device", () => {
      expect(classifySignIn(chrome, NO_HISTORY)).to.equal("first");
    });

    it("alerts on an unseen device of an account used before", () => {
      const history = { ...NO_HISTORY, hasBeenActive: true };
      expect(classifySignIn(chrome, history)).to.equal("new");
    });

    it("alerts on an unseen device when another one is already known", () => {
      expect(
        classifySignIn(chrome, { ...NO_HISTORY, knownFingerprints: [firefox] }),
      ).to.equal("new");
      expect(
        classifySignIn(chrome, {
          ...NO_HISTORY,
          sessionFingerprints: [firefox],
        }),
      ).to.equal("new");
    });
  });

  describe("the country of a sign-in", () => {
    const inFrance = describeSignInDevice(agent(), "FR").fingerprint;
    const inBrazil = describeSignInDevice(agent(), "BR").fingerprint;
    const nowhere = describeSignInDevice(agent()).fingerprint;
    const used = { ...NO_HISTORY, hasBeenActive: true };

    it("joins the fingerprint, after the device", () => {
      expect(inFrance).to.equal("chrome|windows|desktop|fr");
      expect(nowhere).to.equal("chrome|windows|desktop");
    });

    it("alerts on a known device signing in from another country", () => {
      expect(
        classifySignIn(inBrazil, { ...used, knownFingerprints: [inFrance] }),
      ).to.equal("new");
      expect(
        classifySignIn(inBrazil, { ...used, sessionFingerprints: [inFrance] }),
      ).to.equal("new");
    });

    it("stays quiet for a known device in its known country", () => {
      expect(
        classifySignIn(inFrance, { ...used, knownFingerprints: [inFrance] }),
      ).to.equal("known");
    });

    it("needs the country seen with the device once the sign-in has one", () => {
      expect(
        classifySignIn(inFrance, { ...used, sessionFingerprints: [nowhere] }),
      ).to.equal("new");
    });

    it("matches on the device alone when the sign-in's country is unknown", () => {
      expect(
        classifySignIn(nowhere, { ...used, knownFingerprints: [inFrance] }),
      ).to.equal("known");
    });
  });
});
