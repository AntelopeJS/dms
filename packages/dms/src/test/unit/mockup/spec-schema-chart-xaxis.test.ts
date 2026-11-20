import Ajv2020 from "ajv/dist/2020";
import { expect } from "chai";
import { MOCKUP_SPEC_SCHEMA } from "../../helpers/mockup-spec-schema";

const validate = new Ajv2020({ validateFormats: false }).compile(
  MOCKUP_SPEC_SCHEMA,
);

function specWith(options: {
  xaxisType?: "datetime";
  xAxis: { datetimeFormat: unknown };
}) {
  return {
    version: 1,
    pages: [
      {
        id: "stats",
        title: "Stats",
        tree: [{ id: "weeks", type: "ChartBar", options }],
      },
    ],
  };
}

describe("mockup spec JSON Schema chart x axis", () => {
  it("accepts a datetime ChartBar with xAxis.datetimeFormat", () => {
    const spec = specWith({
      xaxisType: "datetime",
      xAxis: { datetimeFormat: "dd MMM" },
    });
    expect(validate(spec), JSON.stringify(validate.errors)).to.equal(true);
  });

  it("refuses an xAxis.datetimeFormat that is not a string", () => {
    const spec = specWith({ xAxis: { datetimeFormat: 3 } });
    expect(validate(spec)).to.equal(false);
  });
});
