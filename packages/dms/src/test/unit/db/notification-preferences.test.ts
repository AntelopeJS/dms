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
