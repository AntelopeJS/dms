import Ajv2020 from "ajv/dist/2020";
import { expect } from "chai";
import { MOCKUP_SPEC_SCHEMA } from "../../helpers/mockup-spec-schema";

const PADDED_ROUTE = "/api/customers/{{ params.id }}/stats";
const PLAIN_ROUTE = "/orders";

const validate = new Ajv2020({ validateFormats: false }).compile(
  MOCKUP_SPEC_SCHEMA,
);

function specWith(liveRoute: string, builtPath: string) {
  return {
    version: 1,
    pages: [
      {
        id: "orders",
        title: "Orders",
        liveRoutes: { stats: liveRoute },
        tree: [],
      },
    ],
    built: { at: "2026-11-14T10:00:00Z", pages: [{ path: builtPath }] },
  };
}

describe("mockup spec JSON Schema routes", () => {
  it("accepts plain routes in liveRoutes and built pages", () => {
    expect(validate(specWith(PLAIN_ROUTE, PLAIN_ROUTE))).to.equal(true);
  });

  it("accepts a live route whose token pads its key with spaces", () => {
    expect(validate(specWith(PADDED_ROUTE, PLAIN_ROUTE))).to.equal(true);
  });

  it("refuses a built page path that holds a space", () => {
    expect(validate(specWith(PLAIN_ROUTE, PADDED_ROUTE))).to.equal(false);
    expect(validate.errors?.map((error) => error.instancePath)).to.include(
      "/built/pages/0/path",
    );
  });
});
