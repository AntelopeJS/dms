import { expect } from "chai";
import {
  EVERY_TENANT,
  InMemoryBroker,
  type KvStore,
  PresenceTracker,
} from "../../../realtime";

const TOPIC = "presence-persisted:orders";
const HASH = `dms:realtime:presence:${TOPIC}`;
const VALID = {
  topic: TOPIC,
  rowId: "row-1",
  actor: { id: "actor-1", displayName: "Actor", avatarUrl: "https://a/x.png" },
  tenantId: "tenant-a",
  sessionId: "session-1",
  instanceId: "instance-1",
  since: 1_700_000_000_000,
};

const createKv = (): KvStore => {
  const hashes = new Map<string, Map<string, string>>();
  const hashOf = (hash: string): Map<string, string> => {
    const existing = hashes.get(hash);
    if (existing) return existing;
    const created = new Map<string, string>();
    hashes.set(hash, created);
    return created;
  };
  return {
    hset: async (hash, field, value) => {
      hashOf(hash).set(field, value);
    },
    hget: async (hash, field) => hashOf(hash).get(field),
    hdel: async (hash, fields) => {
      for (const field of fields) hashOf(hash).delete(field);
    },
    hgetall: async (hash) => Object.fromEntries(hashOf(hash)),
    scan: async (pattern) =>
      [...hashes.keys()].filter((key) =>
        key.startsWith(pattern.replace("*", "")),
      ),
    setex: async () => {},
    del: async () => {},
  };
};

/**
 * Catches a parser that checks only the routing and actor identifiers of a
 * persisted record: it would return entries without `since` or with a mistyped
 * optional field, though they do not satisfy `PresenceEntry`.
 */
describe("[unit] realtime — persisted presence entries", () => {
  const seed = async (
    records: Record<string, string>,
  ): Promise<{ tracker: PresenceTracker; kv: KvStore }> => {
    const kv = createKv();
    for (const [field, value] of Object.entries(records)) {
      await kv.hset(HASH, field, value);
    }
    return { tracker: new PresenceTracker(new InMemoryBroker(), "me", kv), kv };
  };

  it("returns a complete persisted entry unchanged", async () => {
    const { tracker } = await seed({
      "row-1|session-1": JSON.stringify(VALID),
    });
    expect(await tracker.snapshotForTopic(TOPIC, EVERY_TENANT)).to.deep.equal([
      VALID,
    ]);
  });

  it("accepts an entry without the optional fields", async () => {
    const minimal = {
      topic: TOPIC,
      rowId: "row-1",
      actor: { id: "actor-1" },
      sessionId: "session-1",
      instanceId: "instance-1",
      since: 1,
    };
    const { tracker } = await seed({
      "row-1|session-1": JSON.stringify(minimal),
    });
    expect(await tracker.snapshotForTopic(TOPIC, EVERY_TENANT)).to.deep.equal([
      minimal,
    ]);
  });

  const malformed: Array<[string, object]> = [
    ["no since", { ...VALID, since: undefined }],
    ["a string since", { ...VALID, since: "1700000000000" }],
    ["a null since", { ...VALID, since: null }],
    ["a non-string tenantId", { ...VALID, tenantId: 7 }],
    [
      "a non-string displayName",
      { ...VALID, actor: { id: "a", displayName: 1 } },
    ],
    ["a non-string avatarUrl", { ...VALID, actor: { id: "a", avatarUrl: {} } }],
    ["no instanceId", { ...VALID, instanceId: undefined }],
    ["a non-object actor", { ...VALID, actor: "actor-1" }],
  ];

  for (const [title, record] of malformed) {
    it(`skips a persisted entry with ${title}, keeping the valid ones`, async () => {
      const { tracker } = await seed({
        "row-1|session-1": JSON.stringify(VALID),
        "row-2|session-2": JSON.stringify(record),
      });
      expect(await tracker.snapshotForTopic(TOPIC, EVERY_TENANT)).to.deep.equal(
        [VALID],
      );
    });
  }

  it("skips unparsable persisted records", async () => {
    const { tracker } = await seed({
      "row-1|session-1": JSON.stringify(VALID),
      "row-2|session-2": "{not json",
    });
    expect(await tracker.snapshotForTopic(TOPIC, EVERY_TENANT)).to.deep.equal([
      VALID,
    ]);
  });

  it("sweeps a persisted entry that misses a required field", async () => {
    const { tracker, kv } = await seed({
      "row-1|session-1": JSON.stringify({ ...VALID, since: undefined }),
    });
    await tracker.sweepStaleInstances(new Set(["instance-1"]));
    expect(await kv.hgetall(HASH)).to.deep.equal({});
  });
});
