import { expect } from "chai";
import type { TableViewOptionsSerialized } from "@antelopejs/interface-dms/base/table-view";
import { InvitesSettingsController } from "../../../../pages/settings/users/invites";
import { membersTable } from "../../../../pages/settings/users/members";

const MEMBER_LISTS_ROWS = 10;

function serializedOptions(
  table: typeof membersTable,
): TableViewOptionsSerialized {
  return table.serializeSync().options as TableViewOptionsSerialized;
}

/**
 * The members and invitations lists open on 10 rows, in the compact layout
 * whose footer offers the page size picker.
 */
describe("[unit] pages/settings/members — rows per page", () => {
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
