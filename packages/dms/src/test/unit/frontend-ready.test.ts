import { HTTPResult } from "@antelopejs/interface-api";
import { assert, expect } from "chai";
import { parseFrontendReady } from "../../store/frontend";

const HTTP_BAD_REQUEST = 400;
const MALFORMED_BODIES = [
  null,
  [],
  "ready",
  {},
  { modules: [] },
  { version: "1.0.0" },
  { modules: {}, version: "1.0.0" },
  { modules: [{}], version: "1.0.0" },
  { modules: [{ name: "" }], version: "1.0.0" },
  { modules: [], version: "" },
];

function statusOf(run: () => void): number {
  try {
    run();
  } catch (error: unknown) {
    assert.instanceOf(error, HTTPResult);
    return error.getStatus();
  }
  return expect.fail("expected the body to be refused");
}

describe("[unit] frontend ready report", () => {
  it("parses a report into its modules and version, dropping unknown keys", () => {
    const body = {
      modules: [
        { name: "dms-ui", version: "1.2.3", extra: true },
        { name: "x" },
      ],
      version: "9.9.9",
      extra: 1,
    };
    expect(parseFrontendReady(body)).to.deep.equal({
      modules: [{ name: "dms-ui", version: "1.2.3" }, { name: "x" }],
      version: "9.9.9",
    });
  });

  for (const body of MALFORMED_BODIES) {
    it(`refuses ${JSON.stringify(body)} with a 400`, () => {
      expect(statusOf(() => parseFrontendReady(body))).to.equal(
        HTTP_BAD_REQUEST,
      );
    });
  }
});
