import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { MongoClient } from "mongodb";
import { ReplicaProcess } from "../helpers/replica-process";

const TEST_TIMEOUT_MS = 120_000;
const HOOK_HOLD_MS = 30_000;
const STOP_GRACE_MS = 2000;
const STOP_MARGIN_MS = 3000;
const STARTED_LINE = "replica-host provisioning default";
const ABANDONED_LINE = "Abandoned the provisioning of tenant 'default'";

describe("[integration] stopping while a provisioning hook still runs", function () {
  this.timeout(TEST_TIMEOUT_MS);

  let database: string;
  let replica: ReplicaProcess;

  beforeEach(async () => {
    database = `stop-provisioning-${randomUUID()}`;
    replica = await ReplicaProcess.start(database, HOOK_HOLD_MS);
  });

  afterEach(async () => {
    await replica.remove();
    const client = await MongoClient.connect(process.env.TEST_MONGO_URL ?? "");
    await client.db(database).dropDatabase();
    await client.close();
  });

  it("exits within the grace period and logs the abandoned provisioning", async () => {
    await replica.started();
    await replica.printed(STARTED_LINE);

    const stopMs = await replica.stop(HOOK_HOLD_MS);

    expect(stopMs, replica.log).to.be.below(STOP_GRACE_MS + STOP_MARGIN_MS);
    expect(replica.count(ABANDONED_LINE), replica.log).to.equal(1);
  });
});
