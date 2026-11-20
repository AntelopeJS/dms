import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { LOCK_IDLE_MS } from "../../../mockup";
import {
  eventually,
  followEvents,
  type FollowedStream,
} from "../../helpers/mockup-events";
import {
  heldPaths,
  KPI_A,
  KPI_B,
  lock,
  renew,
  SPEC,
} from "../../helpers/mockup-presence";
import { serveMockupRoutes } from "../../helpers/mockup-routes";

describe("[unit] mockup presence: a lock runs out when it was not renewed", () => {
  let now = 1_000_000;
  const served = serveMockupRoutes(JSON.stringify(SPEC), {
    now: () => now,
    sweepMs: 20,
  });
  const streams: FollowedStream[] = [];

  afterEach(async () => {
    streams.splice(0).forEach((stream) => stream.close());
    await eventually(() => served().engine.streams.size === 0);
  });

  it("holds a block until LOCK_IDLE_MS after its last renewal, then frees it and says so (fails when a renewal is ignored or a lock never expires)", async () => {
    const a = randomUUID();
    const b = randomUUID();
    const { owner: ada, ownerToken } = served();
    streams.push(await followEvents("desk", ownerToken, a));
    const watcher = await followEvents("desk", ownerToken, b);
    streams.push(watcher);
    await lock(ada, a, KPI_A);

    now += LOCK_IDLE_MS - 1;
    const early = await lock(ada, b, KPI_A);
    await lock(ada, a, KPI_A);
    now += LOCK_IDLE_MS - 1;
    const renewed = await lock(ada, b, KPI_A);
    now += 2;
    const freed = await eventually(() => heldPaths(watcher).length === 0);
    const taken = await lock(ada, b, KPI_A);

    expect([early.status, renewed.status]).to.deep.equal([409, 409]);
    expect(freed).to.equal(true);
    expect(taken.status).to.equal(200);
  });

  it("pushes back the expiry of a lock on a request that names no block, and no longer renews one that ran out (fails when a renewal is ignored, or revives a lock that ran out)", async () => {
    const a = randomUUID();
    const b = randomUUID();
    const { owner: ada, ownerToken } = served();
    streams.push(await followEvents("desk", ownerToken, a));
    const watcher = await followEvents("desk", ownerToken, b);
    streams.push(watcher);
    await lock(ada, a, KPI_B);

    now += LOCK_IDLE_MS - 1;
    const renewed = await renew(ada, a);
    now += LOCK_IDLE_MS - 1;
    const stillHeld = await lock(ada, b, KPI_B);
    now += 2;
    const freed = await eventually(() => heldPaths(watcher).length === 0);
    const lateRenewal = await renew(ada, a);

    expect([renewed.status, stillHeld.status]).to.deep.equal([200, 409]);
    expect(freed).to.equal(true);
    expect(lateRenewal.status).to.equal(404);
  });
});
