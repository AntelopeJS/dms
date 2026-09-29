import { expect } from "chai";
import { userNotificationsTableName } from "../../../db/tables";
import { listRawIndexes } from "../../helpers/db";

const USER_FEED_INDEX = "userId_createdAt";
// Module start() runs unawaited under the test runner, so the schema, and the
// indexes it creates, may still be in flight when this suite begins.
const SCHEMA_READY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;

async function feedIndexKey(): Promise<Record<string, unknown> | undefined> {
  const deadline = Date.now() + SCHEMA_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const key = (await listRawIndexes(userNotificationsTableName))[
        USER_FEED_INDEX
      ];
      if (key) return key;
    } catch {
      // The collection does not exist until the schema is registered.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return undefined;
}

describe("[unit] user notifications — a user's feed is served by one index", () => {
  it("indexes the user then the creation date, in that order", async function () {
    this.timeout(SCHEMA_READY_TIMEOUT_MS + POLL_INTERVAL_MS);
    const key = await feedIndexKey();

    expect(key).to.deep.equal({ userId: 1, createdAt: 1 });
    expect(Object.keys(key ?? {})).to.deep.equal(["userId", "createdAt"]);
  });
});
