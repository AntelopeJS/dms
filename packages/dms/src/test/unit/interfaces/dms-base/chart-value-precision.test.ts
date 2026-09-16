import { expect } from "chai";
import {
  ChartCard,
  ChartLine,
  KpiCard,
  TopListCard,
  type ValuePrecision,
} from "@antelopejs/interface-dms/base";

describe("[unit] chart value precision public builders", () => {
  const policies: ValuePrecision[] = ["native", 0, 3];

  for (const valuePrecision of policies) {
    it(`serializes ${valuePrecision} without altering the nested chart`, async () => {
      const options = { title: "Spend", valuePrecision };
      const card = await ChartCard({
        ...options,
        chart: ChartLine({}),
      }).serialize();
      expect(card.options?.valuePrecision).to.equal(valuePrecision);
      expect(card.children).to.have.length(1);
      expect(card.children?.[0]?.component.options).not.to.have.property(
        "valuePrecision",
      );
      expect(
        (await KpiCard(options).serialize()).options?.valuePrecision,
      ).to.equal(valuePrecision);
      expect(
        (await TopListCard(options).serialize()).options?.valuePrecision,
      ).to.equal(valuePrecision);
    });
  }

  it("leaves existing builder declarations unchanged", async () => {
    const card = await ChartCard({
      title: "Spend",
      chart: ChartLine({}),
    }).serialize();
    expect(card.options).not.to.have.property("valuePrecision");
  });
});
