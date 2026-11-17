import { expect } from "chai";
import { PageController, pagesCategory } from "@antelopejs/interface-dms/page";

describe("[unit] interfaces/dms-base — page live mode", () => {
  it("refuses a slower cadence it cannot read, and an empty remember key", () => {
    /**
     * @param {string} id
     * @param {Record<string, unknown>} live
     */
    const declare = (id, live) => () =>
      PageController(id, {
        displayName: "Live page",
        category: pagesCategory,
        live,
      });
    expect(
      declare("live-slow-period", {
        slowRateAfter: { period: "a week", maxRate: 60 },
      }),
    ).to.throw(/live\.slowRateAfter\.period/);
    expect(
      declare("live-slow-zero", {
        slowRateAfter: { period: "0d", maxRate: 60 },
      }),
    ).to.throw(/live\.slowRateAfter\.period/);
    expect(
      declare("live-slow-rate", {
        slowRateAfter: { period: "7d", maxRate: 0 },
      }),
    ).to.throw(/live\.slowRateAfter\.maxRate/);
    expect(declare("live-remember-key", { rememberKey: " " })).to.throw(
      /live\.rememberKey/,
    );
  });
});
