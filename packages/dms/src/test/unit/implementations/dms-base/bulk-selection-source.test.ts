import { GetMetadata } from "@antelopejs/interface-core";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view";
import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import { resolveBulkRowIds } from "../../../../implementations/dms-base/table-view";
import { requestContextFixture } from "../../../helpers/request-context";
import { userFixture } from "../../../helpers/user-fixture";

class RowsController {}

describe("[unit] implementations/dms-base/bulk-selection — a row source", () => {
  it("refuses a source whose controller has no prototype to read through", async () => {
    const withoutPrototype = RowsController.bind(null);
    GetMetadata(withoutPrototype, DataAPIMeta).modelKey = "rows";

    try {
      await resolveBulkRowIds(
        { model: {}, tableView: new TableViewMeta(withoutPrototype) },
        requestContextFixture(),
        userFixture({ _id: "bulk-source-user" }),
      );
    } catch (error) {
      expect(error).to.be.instanceOf(HTTPResult);
      if (!(error instanceof HTTPResult)) throw error;
      expect(error.getStatus()).to.equal(500);
      expect(error.getBody()).to.contain("has no prototype");
      return;
    }
    throw new Error("Expected the source to be refused");
  });
});
