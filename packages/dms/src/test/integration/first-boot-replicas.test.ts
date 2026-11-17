import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { expect } from "chai";
import { MongoClient } from "mongodb";
import { LEASE, ReplicaProcess } from "../helpers/replica-process";

const TEST_TIMEOUT_MS = 240_000;
const STARTED_LINE = "replica-host provisioning default";
const FINISHED_LINE = "replica-host provisioned default";
const HOLD_MS = 2 * LEASE.staleAfterMs;
const POLL_MS = 250;

function provisioning(replicas: ReplicaProcess[]): number {
  return replicas.reduce((total, r) => total + r.count(STARTED_LINE), 0);
}

async function firstToProvision(
  replicas: ReplicaProcess[],
): Promise<ReplicaProcess> {
  for (;;) {
    const holder = replicas.find((replica) => replica.count(STARTED_LINE) > 0);
    if (holder) return holder;
    if (replicas.every((replica) => !replica.running)) {
      throw new Error(replicas.map((replica) => replica.log).join("\n"));
    }
    await setTimeout(POLL_MS);
  }
}

describe("[integration] two replicas on a new database", function () {
  this.timeout(TEST_TIMEOUT_MS);

  let database: string;
  let replicas: ReplicaProcess[];

  beforeEach(async () => {
    database = `first-boot-${randomUUID()}`;
    replicas = await Promise.all([
      ReplicaProcess.start(database, HOLD_MS),
      ReplicaProcess.start(database, HOLD_MS),
    ]);
  });

  afterEach(async () => {
    await Promise.all(replicas.map((replica) => replica.remove()));
    const client = await MongoClient.connect(process.env.TEST_MONGO_URL ?? "");
    await client.db(database).dropDatabase();
    await client.close();
  });

  async function provisioningPending(): Promise<boolean | undefined> {
    const client = await MongoClient.connect(process.env.TEST_MONGO_URL ?? "");
    try {
      const tenant = await client
        .db(database)
        .collection<{ _id: string; provisioningPending?: boolean }>(
          "dms-core__tenants",
        )
        .findOne({ _id: "default" });
      return tenant?.provisioningPending;
    } finally {
      await client.close();
    }
  }

  it("both start and exactly one provisions, however long it takes", async () => {
    await Promise.all(replicas.map((replica) => replica.started()));
    const holder = await firstToProvision(replicas);
    await holder.printed(FINISHED_LINE);
    await setTimeout(HOLD_MS);

    expect(provisioning(replicas)).to.equal(1);
    expect(await provisioningPending()).to.equal(false);
    expect(replicas.map((replica) => replica.running)).to.deep.equal([
      true,
      true,
    ]);
  });

  it("the other replica resumes after the holder is killed", async () => {
    await Promise.all(replicas.map((replica) => replica.started()));
    const holder = await firstToProvision(replicas);
    await holder.kill();
    expect(await provisioningPending()).to.equal(true);

    const survivor = replicas.find((replica) => replica !== holder);
    await survivor?.printed(STARTED_LINE);
    await survivor?.printed(FINISHED_LINE);

    expect(survivor?.count(STARTED_LINE)).to.equal(1);
    expect(await provisioningPending()).to.equal(false);
  });
});
