import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { UserNotificationsModel } from "../../db/models/userNotifications.model";
import {
  authorizedClient,
  type RegisteredUser,
  registerUser,
} from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// Changes made through the members table are told once the write is done, in
// the same request — whichever instance runs it: the member whose roles
// changed hears it, and the other owners hear of a removal. The table's
// guards hand the notification back.

const MEMBERS_API = "/api/tables/members";
const MESSAGES = "$dms.notifications.messages";
const ROLES_CHANGED = `${MESSAGES}.roles_changed.`;
const HTTP_OK = 200;

async function titlesOf(userId: string): Promise<string[]> {
  const notifications = await GetModel(UserNotificationsModel).getByUserId(
    userId,
  );
  return notifications.map((notification) => notification.title ?? "");
}

async function memberRowId(userId: string): Promise<string> {
  const member = await GetModel(TenantMemberModel, DEFAULT_TENANT_ID).getByUser(
    userId,
  );
  if (!member) throw new Error(`${userId} is no member`);
  return member._id;
}

describe("[integration] member change notifications", () => {
  let owner: AxiosInstance;
  let coOwner: RegisteredUser;
  let member: RegisteredUser;

  beforeEach(async () => {
    await resetDatabase();
    owner = authorizedClient((await registerUser({ owner: true })).accessToken);
    coOwner = await registerUser({ owner: true });
    member = await registerUser();
  });

  it("tells a member their roles changed once the edit is written", async () => {
    const [roleId] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
      name: "Support",
      permissions: [],
    });
    const edited = await owner.put(
      `${MEMBERS_API}/edit`,
      { roleIds: [roleId] },
      { params: { id: await memberRowId(member.userId) } },
    );
    expect(edited.status, JSON.stringify(edited.data)).to.equal(HTTP_OK);
    const titles = await titlesOf(member.userId);
    expect(titles.some((title) => title.startsWith(ROLES_CHANGED))).to.equal(
      true,
    );
  });

  it("tells the other owners a member was removed once the row is gone", async () => {
    const removed = await owner.delete(`${MEMBERS_API}/delete`, {
      params: { id: await memberRowId(member.userId) },
    });
    expect(removed.status, JSON.stringify(removed.data)).to.equal(HTTP_OK);
    expect(await titlesOf(coOwner.userId)).to.include(
      `${MESSAGES}.member_removed.title`,
    );
  });
});
