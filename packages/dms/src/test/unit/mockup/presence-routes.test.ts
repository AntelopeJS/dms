import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AxiosInstance, AxiosResponse } from "axios";
import { expect } from "chai";
import { z } from "zod";
import {
  isJsonObject,
  type Json,
  type JsonObject,
  jsonObjectSchema,
  type MockupEngine,
  specValueAt,
} from "../../../mockup";
import {
  eventually,
  followEvents,
  type FollowedStream,
} from "../../helpers/mockup-events";
import {
  GRID,
  heldPaths,
  KPI_A,
  KPI_B,
  KPI_C,
  kpi,
  lastPresence,
  lock,
  lockAnswerSchema,
  lockAt,
  renew,
  ROW,
  SPEC,
  SPEC_URL,
  unlock,
} from "../../helpers/mockup-presence";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { serveMockupRoutes } from "../../helpers/mockup-routes";

const ADA = "Test User";
const BEA = "Bea";

const sourceSchema = z.object({
  spec: jsonObjectSchema,
  digest: z.string(),
  writtenBy: z.object({ name: z.string() }).strict().optional(),
});

const staleSchema = z.object({ message: z.string(), digest: z.string() });

const writeSchema = z.object({
  ok: z.boolean(),
  errors: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
});

async function source(client: AxiosInstance) {
  return sourceSchema.parse((await client.get(SPEC_URL)).data);
}

function tree(spec: JsonObject): Json[] {
  const roots = specValueAt(spec, "/pages/0/tree");
  if (!Array.isArray(roots)) throw new Error("the spec has no tree");
  return roots;
}

function retitle(spec: JsonObject, pointer: string, title: string): void {
  const options = specValueAt(spec, `${pointer}/options`);
  if (!isJsonObject(options)) throw new Error(`${pointer} has no options`);
  options.title = title;
}

/** Writes the spec the editor of `viewer` holds, changed by `change`, over the file it just read. */
async function write(
  client: AxiosInstance,
  viewer: string | undefined,
  change: (spec: JsonObject) => void,
): Promise<AxiosResponse> {
  const read = await source(client);
  const spec = structuredClone(read.spec);
  change(spec);
  return client.put(SPEC_URL, { spec, digest: read.digest, viewer });
}

/** What a suite of two viewers on one mockup holds: each its own client, stream and viewer id. */
interface Viewers {
  ada: AxiosInstance;
  bea: AxiosInstance;
  adaToken: string;
  a: string;
  b: string;
  adaStream: FollowedStream;
  beaStream: FollowedStream;
  specPath: string;
  engine: MockupEngine;
  open: (token: string, viewer?: string) => Promise<FollowedStream>;
}

/** Serves the mockup `desk` to two platform owners, each with a stream open under a viewer id, and resets the file and the streams around each test. */
function useViewers(): () => Viewers {
  const served = serveMockupRoutes(JSON.stringify(SPEC));
  let beaToken: string;
  let streams: FollowedStream[] = [];
  let current: Viewers | undefined;

  before(async () => {
    beaToken = (await registerUser({ owner: true, name: BEA })).accessToken;
  });

  beforeEach(async () => {
    const { owner, ownerToken, dir, engine } = served();
    const specPath = join(dir, "mockups", "desk", "spec.json");
    await writeFile(specPath, JSON.stringify(SPEC));
    streams = [];
    const open = async (token: string, viewer?: string) => {
      const stream = await followEvents("desk", token, viewer);
      streams.push(stream);
      return stream;
    };
    const [a, b] = [randomUUID(), randomUUID()];
    current = {
      ada: owner,
      bea: authorizedClient(beaToken),
      adaToken: ownerToken,
      a,
      b,
      adaStream: await open(ownerToken, a),
      beaStream: await open(beaToken, b),
      specPath,
      engine,
      open,
    };
  });

  afterEach(async () => {
    streams.forEach((stream) => stream.close());
    await eventually(() => current?.engine.streams.size === 0);
  });

  return () => {
    if (!current) throw new Error("The suite's beforeEach hook has not run");
    return current;
  };
}

describe("[unit] mockup presence: locks over HTTP", () => {
  const viewers = useViewers();

  it("refuses a lock on the held block, on its ancestors and on its descendants, answering the holder's name, and grants a sibling (fails when only the very same block is refused)", async () => {
    const { ada, bea, a, b } = viewers();
    expect((await lock(ada, a, KPI_A)).status).to.equal(200);

    const same = await lock(bea, b, KPI_A);
    const parent = await lock(bea, b, ROW);
    const top = await lock(bea, b, GRID);
    const sibling = await lock(bea, b, KPI_B);

    expect([same.status, parent.status, top.status]).to.deep.equal([
      409, 409, 409,
    ]);
    expect(same.data).to.deep.include({
      message: "$dms.refusals.mockup.block_held",
      params: { holder: ADA },
      holder: ADA,
    });
    expect(sibling.status).to.equal(200);

    await unlock(bea, b);
    expect((await lock(ada, a, ROW)).status).to.equal(200);
    const inside = await lock(bea, b, KPI_A);
    const elsewhere = await lock(bea, b, KPI_C);

    expect(inside.status).to.equal(409);
    expect(elsewhere.status).to.equal(200);
    expect((await lock(ada, a, ROW)).status).to.equal(200);
  });

  it("answers the id of the block it holds, and renews it on a request that names no block, wherever a write of another viewer moved the block (fails when a renewal names the block by its place, or no id is answered)", async () => {
    const { ada, bea, a, b, adaStream } = viewers();
    const taken = lockAnswerSchema.parse((await lock(ada, a, KPI_C)).data);
    await write(bea, b, (spec) => {
      tree(spec).splice(1, 0, kpi("New"));
    });
    const moved = "/pages/0/tree/2";
    expect(
      await eventually(() => heldPaths(adaStream).includes(moved)),
    ).to.equal(true);

    const renewal = await renew(ada, a);

    expect(renewal.status).to.equal(200);
    expect(lockAnswerSchema.parse(renewal.data).id).to.equal(taken.id);
    expect(specValueAt((await source(ada)).spec, `${moved}/id`)).to.equal(
      taken.id,
    );
    expect(heldPaths(adaStream)).to.deep.equal([moved]);
    expect((await lock(bea, b, KPI_C)).status).to.equal(200);
  });

  it("answers the id the block has on its own: an id an author wrote on a block under a stamped one (fails when the id of an ancestor is answered)", async () => {
    const { ada, a, specPath } = viewers();
    const block: JsonObject = { id: "revenue", ...kpi("A") };
    const row: JsonObject = { type: "GridRow", children: [block] };
    const grid: JsonObject = { type: "Grid", children: [row] };
    await writeFile(
      specPath,
      JSON.stringify({
        version: 1,
        pages: [{ id: "home", title: "Home", tree: [grid] }],
      }),
    );

    const taken = lockAnswerSchema.parse((await lock(ada, a, KPI_A)).data);

    expect(taken.id).to.equal("revenue");
  });

  it("refuses a renewal from a viewer that holds no lock with 404, and from one with no stream or another user's with 403 (fails when a renewal is granted without a lock)", async () => {
    const { ada, bea, a, b } = viewers();
    await lock(ada, a, KPI_A);

    const none = await renew(bea, b);
    const stranger = await renew(ada, randomUUID());
    const theirs = await renew(bea, a);
    await unlock(ada, a);
    const freed = await renew(ada, a);

    expect([
      none.status,
      stranger.status,
      theirs.status,
      freed.status,
    ]).to.deep.equal([404, 403, 403, 404]);
  });

  it("holds one block per viewer: taking another frees the first (fails when both stay held)", async () => {
    const { ada, bea, a, b } = viewers();
    await lock(ada, a, KPI_A);
    await lock(ada, a, KPI_C);

    const freed = await lock(bea, b, KPI_A);
    const kept = await lock(bea, b, KPI_C);

    expect(freed.status).to.equal(200);
    expect(kept.status).to.equal(409);
  });

  it("frees the lock when the viewer releases it (fails when a release is ignored)", async () => {
    const { ada, bea, a, b } = viewers();
    await lock(ada, a, KPI_A);

    const released = await unlock(ada, a);
    const taken = await lock(bea, b, KPI_A);

    expect(released.status).to.equal(200);
    expect(taken.status).to.equal(200);
  });

  it("frees the locks of a viewer whose last stream closed, and tells the others (fails when a lock outlives its viewer)", async () => {
    const { ada, bea, a, b, adaStream, beaStream } = viewers();
    await lock(ada, a, KPI_A);
    expect(
      await eventually(() => heldPaths(beaStream).includes(KPI_A)),
    ).to.equal(true);

    adaStream.close();

    expect(await eventually(() => heldPaths(beaStream).length === 0)).to.equal(
      true,
    );
    expect((await lock(bea, b, KPI_A)).status).to.equal(200);
  });

  it("keeps the lock while the viewer has another stream open (fails when any closing stream frees it)", async () => {
    const { ada, bea, adaToken, a, b, adaStream, engine, open } = viewers();
    const second = await open(adaToken, a);
    await lock(ada, a, KPI_A);

    adaStream.close();
    await eventually(() => engine.streams.size === 2);
    const refused = await lock(bea, b, KPI_A);

    expect(second.frames.length).to.be.greaterThan(0);
    expect(refused.status).to.equal(409);
  });
});

describe("[unit] mockup presence: a lock guards its block against another viewer's writes", () => {
  const viewers = useViewers();

  it("refuses a spec write that changes a block another viewer holds and leaves the file as it was, and writes a held block's own edit and an unheld block's (fails when the write is not checked, or the holder is refused)", async () => {
    const { ada, bea, a, b, specPath } = viewers();
    await lock(ada, a, KPI_A);
    const before = await readFile(specPath, "utf8");

    const refused = await write(bea, b, (spec) => retitle(spec, KPI_A, "Mine"));
    const refusedNone = await write(bea, undefined, (spec) =>
      retitle(spec, KPI_A, "Anonymous"),
    );

    expect(writeSchema.parse(refused.data)).to.deep.equal({
      ok: false,
      errors: [{ path: KPI_A, message: `${ADA} is editing this block` }],
    });
    expect(writeSchema.parse(refusedNone.data).ok).to.equal(false);
    expect(await readFile(specPath, "utf8")).to.equal(before);

    const unheld = await write(bea, b, (spec) => retitle(spec, KPI_B, "Beta"));
    const own = await write(ada, a, (spec) => retitle(spec, KPI_A, "Alpha"));

    expect(writeSchema.parse(unheld.data).ok).to.equal(true);
    expect(writeSchema.parse(own.data).ok).to.equal(true);
    const written = (await source(ada)).spec;
    expect(specValueAt(written, `${KPI_A}/options/title`)).to.equal("Alpha");
    expect(specValueAt(written, `${KPI_B}/options/title`)).to.equal("Beta");
  });

  it("refuses a spec write that removes the held block or its parent (fails when only edits are checked)", async () => {
    const { ada, bea, a, b } = viewers();
    await lock(ada, a, KPI_A);

    const removeRow = await write(bea, b, (spec) => {
      tree(spec).splice(0, 1);
    });

    expect(writeSchema.parse(removeRow.data).ok).to.equal(false);
  });

  it("keeps a lock on its block after another viewer inserts a block before it, and tells both viewers where it went (fails when the lock stays on the old pointer)", async () => {
    const { ada, bea, a, b, adaStream, beaStream } = viewers();
    await lock(ada, a, KPI_C);

    const inserted = await write(bea, b, (spec) => {
      tree(spec).splice(1, 0, kpi("New"));
    });
    const moved = "/pages/0/tree/2";
    const sawMove = await eventually(
      () =>
        heldPaths(adaStream).includes(moved) &&
        heldPaths(beaStream).includes(moved),
    );
    const edit = await write(bea, b, (spec) => retitle(spec, moved, "Mine"));

    expect(writeSchema.parse(inserted.data).ok).to.equal(true);
    expect(sawMove).to.equal(true);
    expect(writeSchema.parse(edit.data).ok).to.equal(false);
  });

  it("sends each viewer the other's write as a state and the other's lock as a presence (fails when a stream hears only its own changes)", async () => {
    const { ada, a, beaStream } = viewers();
    const stateCount = () =>
      beaStream.frames.filter((frame) => frame.event === "state").length;
    const first = stateCount();

    await write(ada, a, (spec) => retitle(spec, KPI_A, "Live"));
    await lock(ada, a, KPI_C);

    expect(await eventually(() => stateCount() > first)).to.equal(true);
    expect(
      await eventually(
        () =>
          lastPresence(beaStream)?.locks.some(
            (held) => held.name === ADA && held.path === KPI_C,
          ) === true,
      ),
    ).to.equal(true);
    expect(
      lastPresence(beaStream)
        ?.viewers.map((viewer) => viewer.name)
        .sort(),
    ).to.deep.equal([ADA, BEA].sort());
  });
});

describe("[unit] mockup presence: who a viewer is", () => {
  const viewers = useViewers();

  it("refuses a lock naming a viewer that has no stream or belongs to another user (fails when the viewer id is taken on trust)", async () => {
    const { ada, bea, a, specPath } = viewers();
    const stranger = randomUUID();

    const noStream = await lock(ada, stranger, KPI_A);
    const theirs = await lock(bea, a, KPI_A);
    const releaseTheirs = await unlock(bea, a);

    expect([
      noStream.status,
      theirs.status,
      releaseTheirs.status,
    ]).to.deep.equal([403, 403, 403]);
    expect(await readFile(specPath, "utf8")).to.equal(JSON.stringify(SPEC));
  });

  it("writes a spec naming a viewer that has no stream as a write naming none, so an edit sent as the stream closes is not lost (fails when a viewer whose stream is gone is answered 403)", async () => {
    const { ada, bea, a, b, adaStream, beaStream } = viewers();
    await lock(bea, b, KPI_A);
    adaStream.close();
    expect(
      await eventually(() => lastPresence(beaStream)?.viewers.length === 1),
    ).to.equal(true);

    const unheld = await write(ada, a, (spec) => retitle(spec, KPI_C, "Last"));
    const held = await write(ada, a, (spec) => retitle(spec, KPI_A, "Late"));
    const theirs = await write(ada, b, (spec) =>
      retitle(spec, KPI_A, "Stolen"),
    );

    expect(unheld.status).to.equal(200);
    expect(writeSchema.parse(unheld.data).ok).to.equal(true);
    expect(writeSchema.parse(held.data)).to.deep.equal({
      ok: false,
      errors: [{ path: KPI_A, message: `${BEA} is editing this block` }],
    });
    expect(writeSchema.parse(theirs.data).ok).to.equal(false);
    const written = (await source(bea)).spec;
    expect(specValueAt(written, `${KPI_C}/options/title`)).to.equal("Last");
    expect(specValueAt(written, `${KPI_A}/options/title`)).to.equal("A");
    expect(specValueAt(written, `${KPI_B}/options/title`)).to.equal("B");
  });

  it("names the user who wrote the file when the viewer named has no stream left, as an edit sent while leaving is, and no one when no viewer is named (fails when the last write of a viewer that just left is attributed to no one)", async () => {
    const { ada, bea, a, adaStream, beaStream } = viewers();
    adaStream.close();
    expect(
      await eventually(() => lastPresence(beaStream)?.viewers.length === 1),
    ).to.equal(true);

    await write(ada, a, (spec) => retitle(spec, KPI_C, "Last"));
    const afterLeaving = await source(bea);
    await write(ada, undefined, (spec) => retitle(spec, KPI_C, "Anonymous"));
    const afterAnonymous = await source(bea);

    expect(afterLeaving.writtenBy).to.deep.equal({ name: ADA });
    expect(afterAnonymous.writtenBy).to.equal(undefined);
  });

  it("names who wrote the file in the read that follows an editor's write, and no one after a write from outside (fails when every digest is attributed)", async () => {
    const { ada, bea, a, specPath } = viewers();
    await write(ada, a, (spec) => retitle(spec, KPI_A, "Alpha"));
    const afterEditor = await source(bea);

    await writeFile(specPath, JSON.stringify({ ...SPEC, title: "Outside" }));
    const afterOutside = await source(bea);

    expect(afterEditor.writtenBy).to.deep.equal({ name: ADA });
    expect(afterOutside.writtenBy).to.equal(undefined);
  });

  it("still serves a stream that names no viewer, which is no one's and holds nothing (fails when a stream without ?viewer is refused)", async () => {
    const { adaToken, open } = viewers();
    const follower = await open(adaToken);

    expect(
      await eventually(() =>
        follower.frames.some((frame) => frame.event === "presence"),
      ),
    ).to.equal(true);
    expect(lastPresence(follower)?.viewers).to.have.length(2);
    expect(
      lastPresence(follower)?.viewers.map((viewer) => viewer.mine),
    ).to.deep.equal([false, false]);
  });

  it("marks on each stream which viewer and which lock are its own, and sends no viewer id to anyone else, so one user cannot take another's id (fails when the event carries the ids)", async () => {
    const { ada, bea, a, b, adaStream, beaStream } = viewers();
    await lock(ada, a, KPI_A);
    await lock(bea, b, KPI_C);
    await write(ada, a, (spec) => retitle(spec, KPI_A, "Alpha"));
    const heard = (stream: FollowedStream, name: string) =>
      lastPresence(stream)?.locks.find((held) => held.name === name);

    expect(
      await eventually(
        () =>
          heard(adaStream, BEA)?.path === KPI_C &&
          heard(beaStream, ADA)?.path === KPI_A,
      ),
    ).to.equal(true);

    expect(heard(adaStream, ADA)?.mine).to.equal(true);
    expect(heard(adaStream, BEA)?.mine).to.equal(false);
    expect(heard(beaStream, BEA)?.mine).to.equal(true);
    expect(heard(beaStream, ADA)?.mine).to.equal(false);
    expect(
      lastPresence(beaStream)?.viewers.filter((viewer) => viewer.mine),
    ).to.deep.equal([{ name: BEA, mine: true }]);
    const beaSaw = JSON.stringify([
      ...beaStream.frames,
      (await bea.get(SPEC_URL)).data,
    ]);
    expect(beaSaw).to.not.contain(a);
  });
});

describe("[unit] mockup presence: a lock take names its block in the file the client read", () => {
  const viewers = useViewers();

  it("refuses a take whose digest is not the file's, with 409 and the current digest, granting and stamping nothing, so a write that landed first cannot move the lock to another block (fails when the pointer is resolved against whatever the file is now)", async () => {
    const { ada, bea, b, a, adaStream, specPath } = viewers();
    const read = await source(ada);
    await write(bea, b, (spec) => {
      tree(spec).splice(1, 0, kpi("New"));
    });
    const current = await source(ada);
    const before = await readFile(specPath, "utf8");

    const stale = await lockAt(ada, a, KPI_C, read.digest);

    expect(stale.status).to.equal(409);
    expect(staleSchema.parse(stale.data).digest).to.equal(current.digest);
    expect(staleSchema.parse(stale.data).message).to.equal(
      "$dms.refusals.mockup.lock_spec_changed",
    );
    expect(await readFile(specPath, "utf8")).to.equal(before);
    expect(heldPaths(adaStream)).to.deep.equal([]);
    expect((await lock(bea, b, KPI_C)).status).to.equal(200);
  });

  it("grants a take whose digest is the file's, and requires the digest whenever a path is given, while a renewal names none (fails when a take without a digest is granted)", async () => {
    const { ada, a } = viewers();
    const read = await source(ada);

    const unread = await lockAt(ada, a, KPI_A, undefined);
    const taken = await lockAt(ada, a, KPI_A, read.digest);
    const renewal = await renew(ada, a);

    expect(unread.status).to.equal(400);
    expect(taken.status).to.equal(200);
    expect(renewal.status).to.equal(200);
  });
});
