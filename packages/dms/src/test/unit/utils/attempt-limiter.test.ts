import { expect } from "chai";
import { AttemptLimiter } from "../../../utils/attempt-limiter";

const LIMIT = 3;
const WINDOW_MS = 1000;
const MAX_KEYS = 2;

function failTimes(limiter: AttemptLimiter, key: string, count: number) {
  for (let failure = 0; failure < count; failure++) {
    limiter.recordFailure(key, 0);
  }
}

describe("[unit] utils/attempt-limiter", () => {
  it("blocks a key once it reached its limit within the window", () => {
    const limiter = new AttemptLimiter(LIMIT, WINDOW_MS, MAX_KEYS);
    failTimes(limiter, "a", LIMIT - 1);
    expect(limiter.isBlocked("a", 0)).to.equal(false);
    limiter.recordFailure("a", 0);
    expect(limiter.isBlocked("a", 0)).to.equal(true);
    expect(limiter.isBlocked("b", 0)).to.equal(false);
  });

  it("lets the key in again once its window ended", () => {
    const limiter = new AttemptLimiter(LIMIT, WINDOW_MS, MAX_KEYS);
    failTimes(limiter, "a", LIMIT);
    expect(limiter.isBlocked("a", WINDOW_MS - 1)).to.equal(true);
    expect(limiter.isBlocked("a", WINDOW_MS)).to.equal(false);
  });

  it("forgets a key that was reset", () => {
    const limiter = new AttemptLimiter(LIMIT, WINDOW_MS, MAX_KEYS);
    failTimes(limiter, "a", LIMIT);
    limiter.reset("a");
    expect(limiter.isBlocked("a", 0)).to.equal(false);
  });

  it("keeps at most its capacity of keys, dropping the oldest window", () => {
    const limiter = new AttemptLimiter(LIMIT, WINDOW_MS, MAX_KEYS);
    for (const key of ["a", "b", "c"]) failTimes(limiter, key, LIMIT);
    expect(limiter.isBlocked("a", 0)).to.equal(false);
    expect(limiter.isBlocked("b", 0)).to.equal(true);
    expect(limiter.isBlocked("c", 0)).to.equal(true);
  });
});
