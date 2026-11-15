import crypto from "node:crypto";
import { expect } from "chai";
import {
  MAX_SCRAM_ITERATIONS,
  withBoundedScram,
} from "../../../implementations/dms-builder/engine";

const SALT = Buffer.from("salt");

describe("the SCRAM iterations a database check derives", () => {
  /** Fails on a bound that lets a client derive what the server asks for, however large. */
  it("refuses a derivation above the bound inside a check, and records the count", async () => {
    const run = await withBoundedScram(async () => {
      try {
        crypto.pbkdf2Sync("pw", SALT, MAX_SCRAM_ITERATIONS + 1, 32, "sha256");
        return "derived";
      } catch {
        return "refused";
      }
    });
    expect(run).to.deep.equal({
      answer: "refused",
      refused: MAX_SCRAM_ITERATIONS + 1,
    });
  });

  /** Fails on a bound that also refuses the counts a real server asks for. */
  it("derives up to the bound inside a check", async () => {
    const run = await withBoundedScram(
      async () => crypto.pbkdf2Sync("pw", SALT, 4096, 32, "sha256").length,
    );
    expect(run).to.deep.equal({ answer: 32 });
  });

  /** Fails on a bound that changes `pbkdf2Sync` for the rest of the process. */
  it("leaves a derivation outside a check as it is", async () => {
    await withBoundedScram(async () => undefined);
    expect(
      crypto.pbkdf2Sync("pw", SALT, MAX_SCRAM_ITERATIONS + 1, 32, "sha256")
        .length,
    ).to.equal(32);
  });
});
