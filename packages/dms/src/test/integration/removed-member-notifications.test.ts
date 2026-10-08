import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import { SendableNotification } from "@antelopejs/interface-dms/notifications/sendable";
import type { NotificationSubjectInfo } from "@antelopejs/interface-dms/notifications/types";
import type { AxiosInstance, AxiosResponse } from "axios";
import { expect } from "chai";
import { internal } from "../../implementations/dms-notifications";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// A member removed from their only workspace stays signed in. Their
// notifications belong to them, not to the workspace: they still read them,
// the one telling them they were removed included, and nothing else.

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const MEMBERS_API = "/api/tables/members";
const NOTIFICATIONS = "/settings/user/notifications";
const TITLE = "You were removed from the workspace";

const subject: NotificationSubjectInfo = {
  id: "removed-member",
  labelKey: "removed_member",
  category: { id: "removed-member-test", labelKey: "test", icon: "i-ph-bell" },
};

interface InboxRow {
  _id: string;
  title: string;
  isRead: boolean;
}

async function memberRowId(userId: string): Promise<string> {
  const member = await GetModel(TenantMemberModel, DEFAULT_TENANT_ID).getByUser(
    userId,
  );
  if (!member) throw new Error(`${userId} is no member`);
  return member._id;
}

describe("[integration] a member removed from their workspace", () => {
  let removed: AxiosInstance;

  const expectOk = async (request: Promise<AxiosResponse>) => {
    const response = await request;
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return response;
  };

  before(async () => {
    await resetDatabase();
    internal.RegisterNotificationCategory.register(subject.category);
    internal.RegisterNotificationSubject.register(subject);
    const owner = authorizedClient(
      (await registerUser({ owner: true })).accessToken,
    );
    const member = await registerUser();
    removed = authorizedClient(member.accessToken);
    await new SendableNotification({
      icon: "i-ph-bell",
      title: TITLE,
      description: "An owner removed you.",
      subject,
    }).toUser(member.userId);
    await expectOk(
      owner.delete(`${MEMBERS_API}/delete`, {
        params: { id: await memberRowId(member.userId) },
      }),
    );
  });

  after(() => {
    internal.RegisterNotificationSubject.unregister(subject);
    internal.RegisterNotificationCategory.unregister(subject.category);
  });

  it("reads their inbox and marks a notification read and unread", async () => {
    const inbox = await expectOk(removed.get(`${NOTIFICATIONS}/inbox`));
    const rows = (inbox.data as { results: InboxRow[] }).results;
    const notification = rows.find((row) => row.title === TITLE);
    expect(notification, JSON.stringify(rows)).to.not.equal(undefined);

    await expectOk(
      removed.put(`${NOTIFICATIONS}/mark-read/${notification!._id}`),
    );
    await expectOk(
      removed.put(`${NOTIFICATIONS}/mark-unread/${notification!._id}`),
    );
  });

  it("is served what the header bell polls", async () => {
    for (const path of ["unseen-count", "unread-count", "unread-preview"]) {
      await expectOk(removed.get(`${NOTIFICATIONS}/${path}`));
    }
  });

  it("opens the notifications page and its preferences", async () => {
    await expectOk(removed.get(`${NOTIFICATIONS}/pagelayout`));
    await expectOk(removed.get(`${NOTIFICATIONS}/preferences`));
    await expectOk(removed.get(`${NOTIFICATIONS}/categories`));
  });

  it("is still refused the workspace's data", async () => {
    const members = await removed.get("/settings/workspace/members/pagelayout");
    expect(members.status).to.equal(HTTP_FORBIDDEN);
    const table = await removed.get(`${MEMBERS_API}/list`);
    expect(table.status).to.equal(HTTP_FORBIDDEN);
  });
});
