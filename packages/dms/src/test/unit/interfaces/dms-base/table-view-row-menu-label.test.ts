import { expect } from "chai";
import {
  adaptRowActions,
  type TableViewGrants,
} from "@antelopejs/interface-dms/base/table-view/internal/request-filter";

const ALL_GRANTED: TableViewGrants = {
  add: true,
  edit: true,
  delete: true,
  view: true,
  archive: true,
  restore: true,
  viewArchived: true,
  export: true,
};

describe("[unit] interfaces/dms-base/table-view row menu label", () => {
  it("serves the table's menuLabel to the browser", () => {
    const served = adaptRowActions({
      rowActions: { menuLabel: "$features.row_menu" },
      archiveMode: false,
      grants: ALL_GRANTED,
      custom: undefined,
      controllerRules: undefined,
    });

    expect(served.menuLabel).to.equal("$features.row_menu");
  });
});
