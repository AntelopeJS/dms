import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { internal } from "../../implementations/dms-notifications";
import { SendableNotification } from "@antelopejs/interface-dms/notifications/sendable";
import type { NotificationData } from "@antelopejs/interface-dms/notifications/types";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// The routes behind the notifications page's inbox table
// (`notificationInboxTable`): a page of the feed per read-state tab, and the
// dialog "Delete all" asks in.

const LOCATION = "/settings/user/notifications";
const HTTP_OK = 200;
const SENT = 3;

const data: NotificationData = {
  icon: "i-ph-bell",
  title: "Deploy finished",
  description: "v2.4.1 is live.",
  subject: {
    id: "inbox-deploys",
    labelKey: "deploys",
    category: { id: "inbox-test", labelKey: "test", icon: "i-ph-bell" },
  },
};

interface InboxRow {
  _id: string;
  title: string;
  isRead: boolean;
}

interface InboxPage {
  results: InboxRow[];
  total: number;
}

describe("[integration] notifications inbox table", () => {
  let client: AxiosInstance;
  let userId: string;
  // What the feed held before the test's notifications (a signup sends some).
  let baseline: { all: number; unread: number; read: number };

  const inbox = async (query: Record<string, string | number>) => {
    const response = await client.get(`${LOCATION}/inbox`, { params: query });
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return response.data as InboxPage;
  };

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
    userId = owner.userId;
    baseline = {
      all: (await inbox({ limit: 1 })).total,
      unread: (await inbox({ limit: 1, filter_isRead: "is:false" })).total,
      read: (await inbox({ limit: 1, filter_isRead: "is:true" })).total,
    };
    internal.RegisterNotificationCategory.register(data.subject.category);
    internal.RegisterNotificationSubject.register(data.subject);
    // An identical message sent twice in a row is stored once.
    for (let sent = 0; sent < SENT; sent++) {
      await new SendableNotification({
        ...data,
        title: `${data.title} #${sent + 1}`,
      }).toUser(userId);
    }
    const [first] = (await inbox({ limit: 1 })).results;
    const read = await client.put(`${LOCATION}/mark-read/${first!._id}`);
    expect(read.status, JSON.stringify(read.data)).to.equal(HTTP_OK);
  });

  it("pages the feed and counts what its read-state tab lists", async () => {
    const all = await inbox({ limit: 2, offset: 0 });
    expect(all.total).to.equal(baseline.all + SENT);
    expect(all.results).to.have.length(2);

    const unread = await inbox({ limit: 10, filter_isRead: "is:false" });
    expect(unread.total).to.equal(baseline.unread + SENT - 1);
    expect(unread.results.every((row) => !row.isRead)).to.equal(true);

    const read = await inbox({ limit: 10, filter_isRead: "is:true" });
    expect(read.total).to.equal(baseline.read + 1);
  });

  it("counts what 'Delete all' deletes in its dialog", async () => {
    const response = await client.get(`${LOCATION}/delete-all/confirm`);
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    expect(response.data.params).to.deep.equal({ count: baseline.all + SENT });
  });

  it("searches message keys and `$` param values as stored", async () => {
    const title = "$inbox.test.release.title";
    await new SendableNotification({
      ...data,
      title,
      params: { tag: "$v2-final" },
    }).toUser(userId);
    const search = async (query: Record<string, string>) => {
      const response = await client.get(`${LOCATION}/list`, { params: query });
      expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
      return (response.data as InboxRow[]).map((row) => row.title);
    };

    expect(
      await search({ q: "release", keys: "inbox.test.release.title" }),
    ).to.deep.equal([title]);
    expect(await search({ q: "$v2" })).to.deep.equal([title]);
    expect(await search({ q: "release" })).to.deep.equal([]);
  });
});
