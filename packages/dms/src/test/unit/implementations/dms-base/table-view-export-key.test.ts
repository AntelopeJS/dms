import { expect } from "chai";
import { getExportStatus } from "../../../../implementations/dms-base/table-view";
import { requestContextFixture } from "../../../helpers/request-context";
import { userFixture } from "../../../helpers/user-fixture";

class Locationless {
  args = [];
  method = "get";
  func = async () => undefined;
}

describe("[unit] implementations/dms-base/table-view — export key", () => {
  it("refuses an export of a class that is not a Controller", async () => {
    const outcome = await getExportStatus(
      new Locationless(),
      requestContextFixture(new URL("http://localhost/export")),
      "export-id",
      userFixture({ _id: "export-key-user" }),
    ).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(outcome).to.be.instanceOf(TypeError);
    expect(String(outcome)).to.contain(
      "Locationless is not a Controller class",
    );
  });
});
