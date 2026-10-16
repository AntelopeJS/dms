import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { internal } from "../../implementations/dms-notifications";
import { SendableNotification } from "@antelopejs/interface-dms/notifications/sendable";
import type {
  NotificationData,
  NotificationTone,
} from "@antelopejs/interface-dms/notifications/types";
import { buildUserNotificationTopic, getRealtimeBroker } from "../../realtime";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { pageRoutePath } from "@antelopejs/interface-dms/page";

// The unread badge: the header bell (`/counts`) and the Notifications entry
// of the menu (`navBadges`, which each page visit carries, never the cached
// site layout) count the unread notifications, in the tone of the most
// important one, and opening the bell changes neither.

const LOCATION = pageRoutePath("/settings/user/notifications");
const NOTIFICATIONS_PAGE_ID = "settings.user.notifications";
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

const data: NotificationData = {
  icon: "i-ph-bell",
  title: "Badge test",
  description: "",
  subject: {
    id: "badge-subject",
    labelKey: "badge",
    category: { id: "badge-test", labelKey: "test", icon: "i-ph-bell" },
  },
};

interface FeedCounts {
  all: number;
  unread: number;
  unreadTone?: NotificationTone;
}

interface FeedEvent {
  type: string;
  payload?: { counts?: FeedCounts };
}

interface MenuEntry {
  badge?: string;
  badgeTone?: string;
}

interface InboxRow {
  _id: string;
  title: string;
}

describe("[integration] notifications unread badge", () => {
  let client: AxiosInstance;
  let userId: string;

  const counts = async (): Promise<FeedCounts> => {
    const response = await client.get(`${LOCATION}/counts`);
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return response.data as FeedCounts;
  };

  const menuEntry = async (): Promise<MenuEntry | undefined> => {
    // Any page visit carries them, with or without the site layout.
    const response = await client.get("/dms/page", {
      params: { path: "/settings", shared: "false" },
    });
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    const served = (
      response.data.navBadges as Record<
        string,
        { badge: string; tone?: string }
      >
    )[NOTIFICATIONS_PAGE_ID];
    return served && { badge: served.badge, badgeTone: served.tone };
  };

  const send = (title: string, tone?: NotificationTone) =>
    new SendableNotification({ ...data, title, tone }).toUser(userId);

  const idOf = async (title: string): Promise<string> => {
    const response = await client.get(`${LOCATION}/list`, {
      params: { limit: 100 },
    });
    const row = (response.data as InboxRow[]).find(
      (entry) => entry.title === title,
    );
    if (!row) throw new Error(`no notification titled ${title}`);
    return row._id;
  };

  /** What the user's open tabs are told, from now on. */
  const recordEvents = () => {
    const events: FeedEvent[] = [];
    const unsubscribe = getRealtimeBroker().subscribe(
      buildUserNotificationTopic(userId),
      (event) => {
        events.push(event as FeedEvent);
      },
    );
    return { events, unsubscribe };
  };

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
    userId = owner.userId;
    internal.RegisterNotificationCategory.register(data.subject.category);
    internal.RegisterNotificationSubject.register(data.subject);
    // What the signup sent is read, so the test's notifications are the only unread ones.
    await client.put(`${LOCATION}/mark-all-read`);
    await send("info", "neutral");
    await send("untoned");
    await send("not you?", "warning");
    await send("risk", "error");
  });

  after(() => {
    internal.RegisterNotificationSubject.unregister(data.subject);
    internal.RegisterNotificationCategory.unregister(data.subject.category);
  });

  it("counts the unread notifications in the tone of the most important", async () => {
    const bell = await counts();
    expect(bell.unread).to.equal(4);
    expect(bell.unreadTone).to.equal("error");

    expect(await menuEntry()).to.include({ badge: "4", badgeTone: "error" });
  });

  it("keeps the count when the bell opens: it no longer marks anything seen", async () => {
    const seen = await client.put(`${LOCATION}/seen`);
    expect(seen.status).to.equal(HTTP_NOT_FOUND);
    expect((await client.get(`${LOCATION}/unseen-count`)).status).to.equal(
      HTTP_NOT_FOUND,
    );

    expect(await counts()).to.include({ unread: 4, unreadTone: "error" });
  });

  it("falls to the next tone once the most important is read", async () => {
    await client.put(`${LOCATION}/mark-read/${await idOf("risk")}`);
    expect(await counts()).to.include({ unread: 3, unreadTone: "warning" });
    expect(await menuEntry()).to.include({ badge: "3", badgeTone: "warning" });

    await client.put(`${LOCATION}/mark-read/${await idOf("not you?")}`);
    // The untoned one stands out in primary while unread, as in the inbox.
    expect(await counts()).to.include({ unread: 2, unreadTone: "primary" });
  });

  it("answers each change with the counts after it, and tells the user's tabs the same", async () => {
    const { events, unsubscribe } = recordEvents();
    try {
      const info = await idOf("info");
      const read = await client.put(`${LOCATION}/mark-read/${info}`);
      expect(read.status, JSON.stringify(read.data)).to.equal(HTTP_OK);
      const afterRead = await counts();
      expect(afterRead).to.include({ unread: 1, unreadTone: "primary" });
      expect(read.data.counts).to.deep.equal(afterRead);

      const unread = await client.put(`${LOCATION}/mark-unread/${info}`);
      const afterUnread = await counts();
      expect(afterUnread).to.include({ unread: 2, unreadTone: "primary" });
      expect(unread.data.counts).to.deep.equal(afterUnread);

      await send("disposable", "error");
      const removed = await client.delete(
        `${LOCATION}/delete/${await idOf("disposable")}`,
      );
      expect(removed.data.counts).to.deep.equal(await counts());
      expect(removed.data.counts).to.include({ unreadTone: "primary" });

      expect(
        events
          .filter((event) => event.type !== "notification:new")
          .map((event) => [event.type, event.payload?.counts]),
      ).to.deep.equal([
        ["notification:read", afterRead],
        ["notification:unread", afterUnread],
      ]);
    } finally {
      unsubscribe();
    }
  });

  it("shows no badge once everything is read", async () => {
    const { events, unsubscribe } = recordEvents();
    const marked = await client.put(`${LOCATION}/mark-all-read`);
    unsubscribe();
    expect(marked.data.counts).to.deep.equal(await counts());
    expect(marked.data.counts).to.include({ unread: 0 });
    expect(events.map((event) => [event.type, event.payload])).to.deep.equal([
      ["notification:all-read", { counts: marked.data.counts }],
    ]);

    const bell = await counts();
    expect(bell.unread).to.equal(0);
    expect(bell).not.to.have.property("unreadTone");
    const entry = await menuEntry();
    expect(entry?.badge).to.equal(undefined);
    expect(entry?.badgeTone).to.equal(undefined);
  });
});
