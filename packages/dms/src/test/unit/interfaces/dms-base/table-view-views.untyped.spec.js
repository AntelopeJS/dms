import { expect } from "chai";
import { tableViewLink } from "@antelopejs/interface-dms/base/table-view";

describe("[unit] interfaces/dms-base — table view links and URL keys", () => {
  it("refuses to link a controller that is no page", () => {
    class NotAPage {}
    expect(() => tableViewLink(NotAPage, "content", { view: "a" })).to.throw(
      /is no page/,
    );
  });
});
