import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { UserNotificationPreferencesModel } from "../../../db/models/userNotificationPreferences.model";

const USER_ID = "notification-preferences-concurrent-user";
const CONCURRENT_READS = 5;

describe("[unit] notification preferences — one row per user", () => {
  const model = GetModel(UserNotificationPreferencesModel);

  after(async () => {
    await model.table.getAll(USER_ID, "userId").delete().run();
  });

  it("creates a single row under concurrent first reads, and every read gets it", async () => {
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_READS }, () =>
        model.getOrCreatePreferences(USER_ID),
      ),
    );

    const rows = await model.table.getAll(USER_ID, "userId").run();
    expect(rows.map((row) => row._id)).to.deep.equal([USER_ID]);
    for (const result of results) expect(result._id).to.equal(USER_ID);
  });
});

describe("[unit] notification preferences — per-subject merge", () => {
  const model = GetModel(UserNotificationPreferencesModel);
  const MERGE_USER_ID = "notification-preferences-merge-user";

  after(async () => {
    await model.table.getAll(MERGE_USER_ID, "userId").delete().run();
  });

  it("keeps every change when subjects are saved concurrently", async () => {
    await model.getOrCreatePreferences(MERGE_USER_ID);
    await Promise.all([
      model.mergePreferences(MERGE_USER_ID, { "system:account": false }),
      model.mergePreferences(MERGE_USER_ID, { "system:automation": false }),
    ]);

    const stored = await model.getOrCreatePreferences(MERGE_USER_ID);
    expect(stored.preferences["system:account"]).to.equal(false);
    expect(stored.preferences["system:automation"]).to.equal(false);
    expect(stored.preferences["system:security"]).to.equal(true);
  });
});

describe("[unit] notification preferences — bell seen date", () => {
  const model = GetModel(UserNotificationPreferencesModel);
  const SEEN_USER_ID = "notification-preferences-seen-user";

  after(async () => {
    await model.table.getAll(SEEN_USER_ID, "userId").delete().run();
  });

  it("has no seen date until the bell opens, then keeps the latest", async () => {
    expect(await model.getNotificationsSeenAt(SEEN_USER_ID)).to.equal(
      undefined,
    );
    const first = await model.markNotificationsSeen(SEEN_USER_ID);
    expect(
      (await model.getNotificationsSeenAt(SEEN_USER_ID))?.getTime(),
    ).to.equal(first.getTime());

    const preferences = await model.mergePreferences(SEEN_USER_ID, {
      "system:account": false,
    });
    expect(preferences["system:account"]).to.equal(false);
    expect(
      (await model.getNotificationsSeenAt(SEEN_USER_ID))?.getTime(),
    ).to.equal(first.getTime());
  });
});
