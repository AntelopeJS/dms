import { expect } from "chai";
import {
  combineNavBadgeCounts,
  strongestNavBadgeTone,
} from "@antelopejs/interface-dms/page/internal/nav-badges";

describe("[unit] interfaces/dms/page — navigation badge tones", () => {
  it("leaves a bare count neutral", () => {
    expect(combineNavBadgeCounts([4])).to.deep.equal({ count: 4 });
  });

  it("keeps the tone a count gives", () => {
    expect(
      combineNavBadgeCounts([{ count: 2, tone: "warning" }]),
    ).to.deep.equal({ count: 2, tone: "warning" });
  });

  it("adds up several counts in the strongest tone of those that count", () => {
    expect(
      combineNavBadgeCounts([
        3,
        { count: 1, tone: "success" },
        { count: 2, tone: "primary" },
        { count: 0, tone: "error" },
      ]),
    ).to.deep.equal({ count: 6, tone: "primary" });
  });

  it("shows nothing for counts of zero", () => {
    expect(
      combineNavBadgeCounts([0, { count: 0, tone: "error" }]),
    ).to.deep.equal({ count: 0 });
  });

  it("ranks error, warning, primary, success, then neutral", () => {
    expect(strongestNavBadgeTone(["neutral", "success"])).to.equal("success");
    expect(strongestNavBadgeTone(["success", "primary"])).to.equal("primary");
    expect(strongestNavBadgeTone(["primary", "warning"])).to.equal("warning");
    expect(strongestNavBadgeTone(["warning", "error", undefined])).to.equal(
      "error",
    );
    expect(strongestNavBadgeTone([undefined])).to.equal(undefined);
  });
});
