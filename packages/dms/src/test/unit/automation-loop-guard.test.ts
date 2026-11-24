import { expect } from "chai";
import {
  AutomationLoopGuard,
  LOOP_GUARD_LIMIT,
  LOOP_GUARD_WINDOW_MS,
} from "../../automation";

describe("[unit] automation loop guard", () => {
  it("drops a subject's events past the limit within the window, and admits it again after", () => {
    const guard = new AutomationLoopGuard();
    const start = 1_000_000;
    const admitted = Array.from({ length: LOOP_GUARD_LIMIT + 2 }, (_, index) =>
      guard.admit("tenant:user", start + index),
    );
    expect(admitted).to.deep.equal([
      ...Array.from({ length: LOOP_GUARD_LIMIT }, () => true),
      false,
      false,
    ]);
    expect(guard.admit("tenant:other", start + LOOP_GUARD_LIMIT)).to.equal(
      true,
    );
    expect(
      guard.admit("tenant:user", start + LOOP_GUARD_WINDOW_MS + 1),
    ).to.equal(true);
  });
});
