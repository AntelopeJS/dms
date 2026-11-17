import { expect } from "chai";
import { optionsOf } from "./table-view-footer.fixture";

describe("[unit] interfaces/dms-base — table view footer and empty states", () => {
  it("refuses a sum without a field, an unknown column, and a legend that is no select", () => {
    expect(() =>
      optionsOf({ footer: { summary: [{ label: "Sum", op: "sum" }] } }),
    ).to.throw(/sums no field/);
    expect(() =>
      optionsOf({
        footer: {
          summary: [
            {
              label: "Bad",
              op: "count",
              where: { not: { field: "nope", equals: "x" } },
            },
          ],
        },
      }),
    ).to.throw(/unknown column "nope"/);
    expect(() => optionsOf({ footer: { legend: "note" } })).to.throw(
      /must name a SelectType column/,
    );
  });
});
