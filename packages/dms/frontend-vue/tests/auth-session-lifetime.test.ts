import { describe, expect, it } from "vitest";
import { isPersistent } from "../layers/dms-auth/app/entries/server/accounts";

describe("a session's lifetime", () => {
  it("outlives the browser only when written persistent", () => {
    expect(isPersistent({ persistent: true })).toBe(true);
    expect(isPersistent({ persistent: false })).toBe(false);

    expect(isPersistent({})).toBe(false);
    expect(isPersistent(undefined)).toBe(false);
  });
});
