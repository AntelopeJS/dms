import { GetMetadata } from "@antelopejs/interface-core";
import { expect } from "chai";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view";
import { memberSettingDataAPI } from "@antelopejs/interface-dms/data-controllers";
import { inviteSettingDataAPI } from "../../../../pages/settings/users/invites";

// The settings column beside the sidebar and the settings menu on a 1440px
// screen.
const SETTINGS_TABLE_WIDTH = 865;
// The grid's row actions, as it sizes them (useTableColumns): the cell
// gutters, then each button and the gaps between them.
const CELL_GUTTERS = 28;
const ICON_BUTTON = 24;
const BUTTON_GAP = 4;
const MENU_ACTIONS_WIDTH = 91;
// Labelled buttons: their padding and icon, then ~6.5px a character.
const LABEL_PADDING = 20;
const LABEL_ICON = 16;
const LABEL_CHARACTER = 6.5;
const RESEND_BUTTON =
  LABEL_PADDING + LABEL_ICON + "Resend".length * LABEL_CHARACTER;
const REVOKE_BUTTON = LABEL_PADDING + "Revoke".length * LABEL_CHARACTER;
// Edit and Copy link (icons), Resend and Revoke (labelled).
const INVITE_ACTIONS_WIDTH =
  CELL_GUTTERS +
  2 * ICON_BUTTON +
  RESEND_BUTTON +
  REVOKE_BUTTON +
  3 * BUTTON_GAP;

function gridWidth(controller: object, columns: string[]): number {
  const meta = GetMetadata(controller as never, TableViewMeta);
  return columns.reduce((sum, key) => {
    const size = meta.columns[key]?.size;
    expect(size, `${key} has a size`).to.be.a("number");
    return sum + (size ?? 0);
  }, 0);
}

/**
 * The members and invitations tables show every column on a 1440px screen:
 * none runs under the row actions pinned to the right.
 */
describe("[unit] pages/settings/members — table widths", () => {
  it("fits the members table beside its menu", () => {
    const width = gridWidth(memberSettingDataAPI, [
      "name",
      "roleIds",
      "lastActiveAt",
      "twoFactorMethods",
      "joinedAt",
    ]);
    expect(width + MENU_ACTIONS_WIDTH).to.be.at.most(SETTINGS_TABLE_WIDTH);
  });

  it("fits the invitations table beside its labelled actions", () => {
    const width = gridWidth(inviteSettingDataAPI, [
      "email",
      "roles_ids",
      "createdAt",
      "expiresAt",
      "status",
    ]);
    expect(width + INVITE_ACTIONS_WIDTH).to.be.at.most(SETTINGS_TABLE_WIDTH);
  });
});
