import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import {
  createAnnotation,
  listAnnotations,
  type MockupEvent,
  type MockupName,
  mockupNameSchema,
  MockupStore,
  parseMockupName,
  updateAnnotation,
} from "../../../mockup";

const NAME = mockupNameSchema.parse("desk");
const SAVE_TO_STATE_BUDGET_MS = 1000;
const CONCURRENT_CREATES = 25;

function spec(title: string): string {
  return JSON.stringify({
    version: 1,
    pages: [
      {
        id: "home",
        title,
        tree: [{ type: "KpiCard", options: { title, staticValue: 1 } }],
      },
    ],
  });
}

/** A subscription waiting for one event: `ready` once subscribed, with what ends it. */
interface PendingEvent {
  ready: Promise<() => void>;
  event: Promise<MockupEvent>;
}

/** Resolves with the first event `store` sends for `name` that `accept` takes. */
function nextEvent(
  store: MockupStore,
  name: MockupName,
  accept: (event: MockupEvent) => boolean,
): PendingEvent {
  let resolve: (event: MockupEvent) => void = () => {};
  const event = new Promise<MockupEvent>((settle) => {
    resolve = settle;
  });
  let initial = true;
  const ready = store
    .subscribe(name, (received) => {
      if (initial) {
        initial = false;
        return;
      }
      if (accept(received)) resolve(received);
    })
    .then((unsubscribe) => {
      if (!unsubscribe) throw new Error("the mockup does not exist");
      return unsubscribe;
    });
  return { ready, event };
}

let root: string;
let store: MockupStore;

/** One mockup, `desk`, in a fresh mockups directory for each test. */
function withMockupsDirectory(): void {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dms-mockups-"));
    await mkdir(join(root, NAME));
    await writeFile(join(root, NAME, "spec.json"), spec("First"));
    store = new MockupStore(root);
  });

  afterEach(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
}

describe("[unit] mockup store", () => {
  withMockupsDirectory();

  it("keeps the last good pages when spec.json stops being JSON", async () => {
    const good = await store.state(NAME);
    await writeFile(
      join(root, NAME, "spec.json"),
      '{ "version": 1, "pages": [',
    );
    const broken = await store.state(NAME);

    expect(broken?.pages).to.deep.equal(good?.pages);
    expect(broken?.pages[0].title).to.equal("First");
    expect(broken?.issues).to.have.length(1);
    expect(broken?.issues[0].path).to.equal("");
    expect(broken?.revision).to.equal((good?.revision ?? 0) + 1);
  });

  it("follows a mockup whatever an unreadable sibling directory holds", async () => {
    const locked = join(root, "locked");
    await mkdir(locked);
    await chmod(locked, 0);
    try {
      const { ready, event } = nextEvent(
        store,
        NAME,
        (received) =>
          received.event === "state" &&
          received.data.pages[0]?.title === "Beside",
      );
      const unsubscribe = await ready;
      await writeFile(join(root, NAME, "spec.json"), spec("Beside"));
      const received = await event;
      unsubscribe();

      expect(received.event).to.equal("state");
    } finally {
      await chmod(locked, 0o700);
    }
  });

  it("keeps following a mockup whose directory is deleted and made again", async () => {
    const { ready, event } = nextEvent(
      store,
      NAME,
      (received) =>
        received.event === "state" && received.data.pages[0]?.title === "Again",
    );
    const unsubscribe = await ready;
    await rm(join(root, NAME), { recursive: true });
    await mkdir(join(root, NAME));
    await writeFile(join(root, NAME, "spec.json"), spec("Again"));
    const received = await event;
    const current = await store.state(NAME);
    unsubscribe();

    expect(received.event).to.equal("state");
    expect(current?.pages[0].title).to.equal("Again");
  });

  it("sends a subscriber the new state within a second of a save", async () => {
    const { ready, event } = nextEvent(
      store,
      NAME,
      (received) =>
        received.event === "state" &&
        received.data.pages[0]?.title === "Second",
    );
    const unsubscribe = await ready;
    const saved = Date.now();
    await writeFile(join(root, NAME, "spec.json"), spec("Second"));
    const received = await event;
    const elapsed = Date.now() - saved;
    unsubscribe();

    expect(received.event).to.equal("state");
    expect(elapsed).to.be.below(SAVE_TO_STATE_BUDGET_MS);
  });
});

describe("[unit] mockup store names and annotations", () => {
  withMockupsDirectory();

  it("sends the annotations again, placed where their blocks moved to, when only the spec changed (fails when a spec change sends the state alone)", async () => {
    const block = {
      type: "KpiCard",
      options: { title: "Mark", staticValue: 1 },
    };
    const page = (...tree: unknown[]) =>
      JSON.stringify({ version: 1, pages: [{ id: "home", title: "T", tree }] });
    await writeFile(
      join(root, NAME, "spec.json"),
      page({ ...block, id: "mark" }),
    );
    await writeFile(
      join(root, NAME, "annotations.json"),
      JSON.stringify({
        version: 2,
        annotations: [
          {
            id: "n1",
            anchor: { block: "mark", steps: [] },
            text: "x",
            status: "open",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
    const { ready, event } = nextEvent(
      store,
      NAME,
      (received) =>
        received.event === "annotations" &&
        received.data.annotations[0]?.path === "/pages/0/tree/1",
    );
    const unsubscribe = await ready;
    await writeFile(
      join(root, NAME, "spec.json"),
      page(block, { ...block, id: "mark" }),
    );
    const received = await event;
    unsubscribe();

    expect(received.event).to.equal("annotations");
  });

  it("lists only directories with a spec, under a valid name", async () => {
    await mkdir(join(root, "no-spec"));
    await mkdir(join(root, "Bad Name"));
    await writeFile(join(root, "Bad Name", "spec.json"), spec("Hidden"));

    const listed = await store.list();

    expect(listed.map(({ name, status }) => [name, status])).to.deep.equal([
      [NAME, "draft"],
    ]);
  });

  it("refuses a name that would leave the mockups directory", () => {
    expect(parseMockupName("..")).to.equal(undefined);
    expect(parseMockupName("../desk")).to.equal(undefined);
    expect(parseMockupName("desk/../..")).to.equal(undefined);
    expect(parseMockupName("%2e%2e")).to.equal(undefined);
    expect(parseMockupName("desk")).to.equal(NAME);
  });

  it("refuses a name the static schema route answers in its place", () => {
    expect(parseMockupName("schema")).to.equal(undefined);
    expect(parseMockupName("schemas")).to.equal("schemas");
  });

  it("round-trips annotations and keeps every one of concurrent creates", async () => {
    const created = await Promise.all(
      Array.from({ length: CONCURRENT_CREATES }, (_, index) =>
        createAnnotation(
          NAME,
          { page: "home", path: "/pages/0/tree/0", text: `note ${index}` },
          root,
        ),
      ),
    );
    const first = created[0];
    if (first.kind !== "created") throw new Error(`not created: ${first.kind}`);
    const resolved = await updateAnnotation(
      NAME,
      first.annotation.id,
      { status: "resolved" },
      root,
    );
    const reopened = await updateAnnotation(
      NAME,
      first.annotation.id,
      { status: "open", text: "again" },
      root,
    );
    const listed = (await listAnnotations(NAME, root)) ?? [];
    const createdIds = created.map((creation) =>
      creation.kind === "created" ? creation.annotation.id : creation.kind,
    );
    const listedIds = listed.map(({ id }) => id);

    expect(listedIds).to.have.members([...new Set(createdIds)]);
    expect(listed.map((annotation) => annotation.text)).to.have.members([
      "again",
      ...Array.from(
        { length: CONCURRENT_CREATES - 1 },
        (_, index) => `note ${index + 1}`,
      ),
    ]);
    expect(resolved?.status).to.equal("resolved");
    expect(resolved?.resolvedAt).to.be.a("string");
    expect(reopened).to.not.have.property("resolvedAt");
    expect(listed[listedIds.indexOf(first.annotation.id)]).to.deep.equal(
      reopened,
    );
  });

  it("answers nothing for the annotations of a mockup that does not exist", async () => {
    const missing = mockupNameSchema.parse("missing");

    expect(await listAnnotations(missing, root)).to.equal(undefined);
    expect(
      await createAnnotation(
        missing,
        { page: "home", path: "", text: "x" },
        root,
      ),
    ).to.deep.equal({ kind: "no_mockup" });
  });
});
