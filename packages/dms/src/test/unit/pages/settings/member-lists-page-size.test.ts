import { assert, expect } from "chai";
import type { TableViewOptionsSerialized } from "@antelopejs/interface-dms/base/table-view";
import {
  InvitesSettingsController,
  membersTable,
} from "../../../../pages/members";

const MEMBER_LISTS_ROWS = 10;

function serializedOptions(
  table: typeof membersTable,
): TableViewOptionsSerialized {
  const { options } = table.serializeSync();
  assert.isDefined(options);
  return options;
}

describe("[unit] pages/settings/members — rows per page: the members and invitations lists open on 10 rows, in the compact layout whose footer offers the page size picker", () => {
  it("opens the members list on 10 rows", () => {
    const options = serializedOptions(membersTable);
    expect(options.layout).to.equal("compact");
    expect(options.pageSize).to.equal(MEMBER_LISTS_ROWS);
  });

  it("opens the invitations list on 10 rows", () => {
    const options = serializedOptions(InvitesSettingsController.table);
    expect(options.layout).to.equal("compact");
    expect(options.pageSize).to.equal(MEMBER_LISTS_ROWS);
  });
});
