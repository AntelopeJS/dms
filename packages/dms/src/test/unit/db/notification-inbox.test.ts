import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { UserNotificationsModel } from "../../../db/models/userNotifications.model";

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

  it("returns the ids mark-all-read changed, and reopens only those of the user", async () => {
    const readId = await seed(USER_ID, "already read");
    await model.markAsRead(readId);
    const unreadIds = [await seed(USER_ID, "a"), await seed(USER_ID, "b")];
    const foreignId = await seed(OTHER_USER_ID, "foreign");
    await model.markAsRead(foreignId);

    const markedIds = await model.markAllAsRead(USER_ID);
    expect(markedIds).to.have.members(unreadIds);
    expect(await model.countUnread(USER_ID)).to.equal(0);

    const reopened = await model.markManyAsUnread(USER_ID, [
      ...markedIds,
      foreignId,
      "missing-notification",
    ]);
    expect(reopened).to.have.members(unreadIds);
    expect(await model.countUnread(USER_ID)).to.equal(unreadIds.length);
    expect((await model.get(foreignId))?.isRead).to.equal(true);
    expect((await model.get(readId))?.isRead).to.equal(true);
  });
});
