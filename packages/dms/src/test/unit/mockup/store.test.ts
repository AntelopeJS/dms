import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  WATCH_DEBOUNCE_MS,
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

describe("[unit] mockup store", () => {
  let root: string;
  let store: MockupStore;

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
    expect(elapsed).to.be.at.least(WATCH_DEBOUNCE_MS);
  });

  it("lists only directories with a spec, under a valid name", async () => {
    await mkdir(join(root, "no-spec"));
    await mkdir(join(root, "Bad Name"));
    await writeFile(join(root, "Bad Name", "spec.json"), spec("Hidden"));

    expect(await store.list()).to.deep.equal([{ name: NAME, pages: 1 }]);
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
    if (!first) throw new Error("the mockup does not exist");
    const resolved = await updateAnnotation(
      NAME,
      first.id,
      { status: "resolved" },
      root,
    );
    const reopened = await updateAnnotation(
      NAME,
      first.id,
      { status: "open", text: "again" },
      root,
    );
    const listed = (await listAnnotations(NAME, root)) ?? [];

    expect(new Set(listed.map((annotation) => annotation.id)).size).to.equal(
      CONCURRENT_CREATES,
    );
    expect(listed.map((annotation) => annotation.text).sort()).to.have.members([
      "again",
      ...Array.from(
        { length: CONCURRENT_CREATES - 1 },
        (_, index) => `note ${index + 1}`,
      ),
    ]);
    expect(resolved?.status).to.equal("resolved");
    expect(resolved?.resolvedAt).to.be.a("string");
    expect(reopened).to.not.have.property("resolvedAt");
    expect(listed[0]).to.deep.equal(reopened);
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
    ).to.equal(undefined);
  });
});
