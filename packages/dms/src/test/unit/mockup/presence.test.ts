import { expect } from "chai";
import {
  acquired,
  blockIdOf,
  joined,
  left,
  LOCK_IDLE_MS,
  NO_PRESENCE,
  parseViewerId,
  renewed,
  settled,
  viewerOf,
} from "../../../mockup";

type LockRequest = Parameters<typeof acquired>[1];
type BlockAnchor = LockRequest["anchor"];
type BlockTree = LockRequest["tree"];

const ADA_VIEWER = parseViewerId("11111111-1111-4111-8111-111111111111");
const BEA_VIEWER = parseViewerId("22222222-2222-4222-8222-222222222222");
const ADA = { userId: "u1", name: "Ada" };
const BEA = { userId: "u2", name: "Bea" };

const FIRST: BlockAnchor = { block: "b-aaaaaaaa", steps: [] };
const SECOND: BlockAnchor = { block: "b-bbbbbbbb", steps: [] };

const TREE: BlockTree = {
  pages: [
    {
      id: "home",
      tree: [
        { id: "b-aaaaaaaa", children: [] },
        { id: "b-bbbbbbbb", children: [] },
      ],
    },
  ],
};

function viewers() {
  if (!ADA_VIEWER || !BEA_VIEWER) throw new Error("the viewer ids are invalid");
  return { ada: ADA_VIEWER, bea: BEA_VIEWER };
}

describe("[unit] mockup presence: the table", () => {
  it("keeps a viewer id for the user who first named it, so another user's stream cannot take its place (fails when the last to name an id wins)", () => {
    const { ada } = viewers();
    const first = joined(NO_PRESENCE, ada, ADA);

    const taken = first && joined(first, ada, BEA);

    expect(taken).to.equal(undefined);
    expect(first && viewerOf(first, ada, BEA.userId)).to.equal(undefined);
    expect(first && viewerOf(first, ada, ADA.userId)?.name).to.equal("Ada");
  });

  it("frees a lock whose block left the spec, and keeps every lock while the spec cannot be read (fails when an unreadable spec frees the locks, or a removed block keeps its lock)", () => {
    const { ada } = viewers();
    const now = 1000;
    const table = joined(NO_PRESENCE, ada, ADA);
    const taken =
      table && acquired(table, { viewer: ada, anchor: FIRST, tree: TREE, now });
    if (taken?.kind !== "granted") throw new Error("the lock was not granted");

    const unreadable = settled(taken.table, undefined, now + 1);
    const removed = settled(
      taken.table,
      { pages: [{ id: "home", tree: [{ id: "b-bbbbbbbb", children: [] }] }] },
      now + 1,
    );

    expect(unreadable.locks).to.have.length(1);
    expect(removed.locks).to.have.length(0);
  });

  it("grants a lock to a viewer that is on the mockup and to no other, and never to a block it cannot find (fails when a viewer that left still takes locks)", () => {
    const { ada, bea } = viewers();
    const table = joined(NO_PRESENCE, ada, ADA);
    if (!table) throw new Error("the viewer did not join");
    const request = { anchor: SECOND, tree: TREE, now: 1 };

    const known = acquired(table, { viewer: ada, ...request });
    const stranger = acquired(table, { viewer: bea, ...request });
    const afterLeaving = acquired(left(table, ada), {
      viewer: ada,
      ...request,
    });
    const missing = acquired(table, {
      viewer: ada,
      ...request,
      anchor: { block: "b-cccccccc", steps: [] },
    });

    expect(known.kind).to.equal("granted");
    expect(stranger.kind).to.equal("unknown_viewer");
    expect(afterLeaving.kind).to.equal("unknown_viewer");
    expect(missing.kind).to.equal("no_node");
    expect(
      known.kind === "granted" && known.table.locks[0]?.expiresAt,
    ).to.equal(1 + LOCK_IDLE_MS);
  });

  it("renews the lock a viewer holds wherever its block is, and renews none for a viewer that holds none or whose lock ran out (fails when a renewal needs the block's place, or revives an expired lock)", () => {
    const { ada, bea } = viewers();
    const now = 1000;
    const table = joined(NO_PRESENCE, ada, ADA);
    const withBea = table && joined(table, bea, BEA);
    const taken =
      withBea &&
      acquired(withBea, { viewer: ada, anchor: SECOND, tree: TREE, now });
    if (taken?.kind !== "granted") throw new Error("the lock was not granted");
    const moved = settled(
      taken.table,
      {
        pages: [
          {
            id: "home",
            tree: [
              { id: "b-aaaaaaaa", children: [] },
              { id: "b-inserted", children: [] },
              { id: "b-bbbbbbbb", children: [] },
            ],
          },
        ],
      },
      now,
    );

    const later = renewed(moved, { viewer: ada, now: now + LOCK_IDLE_MS - 1 });
    const none = renewed(moved, { viewer: bea, now });
    const ranOut = renewed(moved, { viewer: ada, now: now + LOCK_IDLE_MS });
    const stranger = renewed(NO_PRESENCE, { viewer: ada, now });

    expect(later.kind).to.equal("renewed");
    expect(later.kind === "renewed" && later.id).to.equal("b-bbbbbbbb");
    expect(
      later.kind === "renewed" && later.table.locks[0]?.site.path,
    ).to.equal("/pages/0/tree/2");
    expect(
      later.kind === "renewed" && later.table.locks[0]?.expiresAt,
    ).to.equal(now + LOCK_IDLE_MS - 1 + LOCK_IDLE_MS);
    expect(none.kind).to.equal("no_lock");
    expect(ranOut.kind).to.equal("no_lock");
    expect(stranger.kind).to.equal("unknown_viewer");
  });

  it("names a block by its own id: the last step of its anchor, else the anchor's block (fails when an ancestor's id names the block)", () => {
    expect(blockIdOf({ block: "b-aaaaaaaa", steps: [] })).to.equal(
      "b-aaaaaaaa",
    );
    expect(blockIdOf({ block: "b-aaaaaaaa", steps: ["row", "cell"] })).to.equal(
      "cell",
    );
    expect(blockIdOf({ block: "cell", steps: [], page: "home" })).to.equal(
      "cell",
    );
  });
});
