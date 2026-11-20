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
  LOCK_IDLE_MS,
  type MockupEngine,
  specValueAt,
} from "../../../mockup";
import {
  eventually,
  followEvents,
  type FollowedStream,
} from "../../helpers/mockup-events";
import { authorizedClient, registerUser } from "../../helpers/auth";
import {
  MOCKUP_API as BASE,
  serveMockupRoutes,
} from "../../helpers/mockup-routes";

const kpi = (title: string): JsonObject => ({
  type: "KpiCard",
  options: { title },
});

const SPEC: JsonObject = {
  version: 1,
  pages: [
    {
      id: "home",
      title: "Home",
      tree: [
        {
          type: "Grid",
          children: [{ type: "GridRow", children: [kpi("A"), kpi("B")] }],
        },
        kpi("C"),
      ],
    },
  ],
};

const GRID = "/pages/0/tree/0";
const ROW = `${GRID}/children/0`;
const KPI_A = `${ROW}/children/0`;
const KPI_B = `${ROW}/children/1`;
const KPI_C = "/pages/0/tree/1";
const LOCKS = `${BASE}/desk/locks`;
const SPEC_URL = `${BASE}/desk/spec`;

const ADA = "Test User";
const BEA = "Bea";

const presenceSchema = z.object({
  viewers: z.array(z.object({ viewer: z.string(), name: z.string() })),
  locks: z.array(
    z.object({
      viewer: z.string(),
      name: z.string(),
      page: z.string(),
      path: z.string(),
    }),
  ),
});

const sourceSchema = z.object({
  spec: jsonObjectSchema,
  digest: z.string(),
  writtenBy: z.object({ viewer: z.string(), name: z.string() }).optional(),
});

const writeSchema = z.object({
  ok: z.boolean(),
  errors: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
});

function lastPresence(stream: FollowedStream) {
  const frame = stream.frames.findLast((entry) => entry.event === "presence");
  return frame && presenceSchema.parse(JSON.parse(frame.data));
}

function heldPaths(stream: FollowedStream): string[] {
  return lastPresence(stream)?.locks.map((lock) => lock.path) ?? [];
}

const lock = (client: AxiosInstance, viewer: string, path: string) =>
  client.put(LOCKS, { viewer, path });

const unlock = (client: AxiosInstance, viewer: string) =>
  client.delete(`${LOCKS}?viewer=${viewer}`);

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
    expect(same.data).to.have.property(
      "message",
      `${ADA} is editing this block`,
    );
    expect(sibling.status).to.equal(200);

    await unlock(bea, b);
    expect((await lock(ada, a, ROW)).status).to.equal(200);
    const inside = await lock(bea, b, KPI_A);
    const elsewhere = await lock(bea, b, KPI_C);

    expect(inside.status).to.equal(409);
    expect(elsewhere.status).to.equal(200);
    expect((await lock(ada, a, ROW)).status).to.equal(200);
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

  it("names who wrote the file in the read that follows an editor's write, and no one after a write from outside (fails when every digest is attributed)", async () => {
    const { ada, bea, a, specPath } = viewers();
    await write(ada, a, (spec) => retitle(spec, KPI_A, "Alpha"));
    const afterEditor = await source(bea);

    await writeFile(specPath, JSON.stringify({ ...SPEC, title: "Outside" }));
    const afterOutside = await source(bea);

    expect(afterEditor.writtenBy).to.deep.equal({ viewer: a, name: ADA });
    expect(afterOutside.writtenBy).to.equal(undefined);
  });

  it("still serves a stream that names no viewer, which is no one's and holds nothing (fails when a stream without ?viewer is refused)", async () => {
    const { adaToken, a, b, open } = viewers();
    const follower = await open(adaToken);

    expect(
      await eventually(() =>
        follower.frames.some((frame) => frame.event === "presence"),
      ),
    ).to.equal(true);
    expect(
      lastPresence(follower)
        ?.viewers.map((viewer) => viewer.viewer)
        .sort(),
    ).to.deep.equal([a, b].sort());
  });
});

describe("[unit] mockup presence: a lock runs out when it was not renewed", () => {
  let now = 1_000_000;
  const served = serveMockupRoutes(JSON.stringify(SPEC), {
    now: () => now,
    sweepMs: 20,
  });
  const streams: FollowedStream[] = [];

  after(() => streams.forEach((stream) => stream.close()));

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
});
