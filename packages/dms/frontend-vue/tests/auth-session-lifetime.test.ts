import { describe, expect, it } from "vitest";
import { isPersistent } from "../layers/dms-auth/server/accounts";

// Sessions and stored accounts are always written with their `persistent`
// flag: only a login that ticked "keep me signed in" outlives the browser.
describe("a session's lifetime", () => {
  it("outlives the browser only when written persistent", () => {
    expect(isPersistent({ persistent: true })).toBe(true);
    expect(isPersistent({ persistent: false })).toBe(false);
    // No flag is no promise to outlive the browser.
    expect(isPersistent({})).toBe(false);
    expect(isPersistent(undefined)).toBe(false);
  });
});
