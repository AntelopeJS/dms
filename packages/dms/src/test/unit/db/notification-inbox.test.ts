import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import type { NotificationTone } from "@antelopejs/interface-dms/notifications/types";
import { UserNotificationsModel } from "../../../db/models/userNotifications.model";
import { resolveNotificationTone } from "../../../utils/notification-tones";

const USER_ID = "notification-inbox-user";
const OTHER_USER_ID = "notification-inbox-other-user";
const CATEGORY_ID = "system";
const SUBJECT_ID = "general";
const NOTIFICATION_COUNT = 3;

describe("[unit] user notifications — inbox filters, counts and undo", () => {
  const model = GetModel(UserNotificationsModel);

  async function seed(userId: string, title: string): Promise<string> {
    const created = await model.create({
      userId,
      icon: "i-ph-bell",
      title,
      description: "",
      categoryId: CATEGORY_ID,
      subjectId: SUBJECT_ID,
      tone: "warning",
    });
    return created._id;
  }

  async function clear(): Promise<void> {
    for (const userId of [USER_ID, OTHER_USER_ID]) {
      await model.table.getAll(userId, "userId").delete().run();
    }
  }

  beforeEach(clear);
  after(clear);

  it("stores the tone of a notification", async () => {
    const id = await seed(USER_ID, "toned");
    expect((await model.get(id))?.tone).to.equal("warning");
  });

  it("filters the feed to unread rows and counts both tabs", async () => {
    const ids = await Promise.all(
      Array.from({ length: NOTIFICATION_COUNT }, (_, index) =>
        seed(USER_ID, `n${index}`),
      ),
    );
    await model.markAsRead(ids[0]);

    const unread = await model.getByUserId(USER_ID, 10, 0, true);
    expect(unread.map((row) => row._id)).to.have.members(ids.slice(1));
    expect(await model.countFeed(USER_ID)).to.deep.equal({
      all: NOTIFICATION_COUNT,
      unread: NOTIFICATION_COUNT - 1,
    });
  });

  it("marks one notification unread again", async () => {
    const id = await seed(USER_ID, "reopen");
    await model.markAsRead(id);
    await model.markAsUnread(id);

    expect((await model.get(id))?.isRead).to.equal(false);
  });

  it("undoes mark-all-read: reopens what it read, and only that", async () => {
    const readId = await seed(USER_ID, "already read");
    await model.markAsRead(readId);
    const unreadIds = [await seed(USER_ID, "a"), await seed(USER_ID, "b")];
    const foreignId = await seed(OTHER_USER_ID, "foreign");

    const { batchId, ids } = await model.markAllAsRead(USER_ID);
    expect(ids).to.have.members(unreadIds);
    expect(await model.countUnread(USER_ID)).to.equal(0);

    expect(await model.undoMarkAllAsRead(OTHER_USER_ID, batchId!)).to.be.empty;
    const reopened = await model.undoMarkAllAsRead(USER_ID, batchId!);
    expect(reopened).to.have.members(unreadIds);
    expect(await model.countUnread(USER_ID)).to.equal(unreadIds.length);
    expect((await model.get(readId))?.isRead).to.equal(true);
    expect((await model.get(foreignId))?.isRead).to.equal(false);
  });

  it("undoes mark-all-read past 500 notifications", async () => {
    const count = 501;
    await Promise.all(
      Array.from({ length: count }, (_, index) =>
        seed(USER_ID, `bulk ${index}`),
      ),
    );

    const { batchId } = await model.markAllAsRead(USER_ID);
    expect(await model.countUnread(USER_ID)).to.equal(0);
    const reopened = await model.undoMarkAllAsRead(USER_ID, batchId!);
    expect(reopened).to.have.length(count);
    expect(await model.countUnread(USER_ID)).to.equal(count);
  });

  it("leaves out of the undo a notification changed since", async () => {
    const [kept, toggled] = [
      await seed(USER_ID, "kept"),
      await seed(USER_ID, "toggled"),
    ];
    const { batchId } = await model.markAllAsRead(USER_ID);
    await model.markAsUnread(toggled);
    await model.markAsRead(toggled);

    expect(await model.undoMarkAllAsRead(USER_ID, batchId!)).to.deep.equal([
      kept,
    ]);
    expect((await model.get(toggled))?.isRead).to.equal(true);
  });

  it("returns no batch when nothing was unread", async () => {
    expect(await model.markAllAsRead(USER_ID)).to.deep.equal({
      batchId: null,
      ids: [],
    });
  });

  describe("unread badge", () => {
    async function seedToned(
      title: string,
      tone?: NotificationTone,
    ): Promise<string> {
      const created = await model.create({
        userId: USER_ID,
        icon: "i-ph-bell",
        title,
        description: "",
        categoryId: CATEGORY_ID,
        subjectId: SUBJECT_ID,
        tone,
      });
      return created._id;
    }

    it("counts the unread rows in the tone of the most important one", async () => {
      await seedToned("info", "neutral");
      await seedToned("good news", "success");
      const risk = await seedToned("risk", "error");
      await seedToned("not you?", "warning");
      await model.markAsRead(await seedToned("read risk", "error"));

      expect(await model.unreadBadge(USER_ID)).to.deep.equal({
        count: 4,
        tone: "error",
      });

      await model.markAsRead(risk);
      expect(await model.unreadBadge(USER_ID)).to.deep.equal({
        count: 3,
        tone: "warning",
      });
    });

    it("weighs an untoned unread row as the inbox draws it", async () => {
      await seedToned("info", "neutral");
      const untoned = await seedToned("untoned");
      const tone = resolveNotificationTone(null, false);

      expect(await model.unreadBadge(USER_ID)).to.deep.equal({
        count: 2,
        tone,
      });
      expect(tone).to.equal("primary");

      await model.markAsRead(untoned);
      expect(await model.unreadBadge(USER_ID)).to.deep.equal({
        count: 1,
        tone: "neutral",
      });
    });

    it("shows no badge once every notification is read", async () => {
      await seedToned("risk", "error");
      await model.markAllAsRead(USER_ID);

      expect(await model.unreadBadge(USER_ID)).to.deep.equal({ count: 0 });
      expect(await model.countFeedWithUnreadTone(USER_ID)).to.deep.equal({
        all: 1,
        unread: 0,
      });
    });

    it("gives the whole feed's totals with the unread tone", async () => {
      await seedToned("good news", "success");
      await model.markAsRead(await seedToned("read risk", "error"));

      expect(await model.countFeedWithUnreadTone(USER_ID)).to.deep.equal({
        all: 2,
        unread: 1,
        unreadTone: "success",
      });
    });
  });
});
