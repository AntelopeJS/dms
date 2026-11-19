import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { type MockupCreated, MockupStore } from "../../../mockup";

const POLL_BUDGET_MS = 3000;
const QUIET_MS = 1300;
const POLL_STEP_MS = 25;
const TEST_BUDGET_MS = 10_000;

function spec(title: string): string {
  return JSON.stringify({
    version: 1,
    title,
    pages: [
      {
        id: "home",
        title,
        tree: [{ type: "KpiCard", options: { title, staticValue: 1 } }],
      },
    ],
  });
}

async function until(condition: () => boolean): Promise<boolean> {
  const deadline = Date.now() + POLL_BUDGET_MS;
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_STEP_MS));
  }
  return condition();
}

function quiet(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, QUIET_MS));
}

async function writeMockup(
  root: string,
  name: string,
  title: string,
): Promise<void> {
  await mkdir(join(root, name), { recursive: true });
  await writeFile(join(root, name, "spec.json"), spec(title));
}

describe("[unit] mockup store: created mockups", function () {
  this.timeout(TEST_BUDGET_MS);
  let root: string;
  let store: MockupStore;
  let created: MockupCreated[];
  const stops: Array<() => void> = [];

  async function listen(): Promise<void> {
    stops.push(await store.subscribeCreated((mockup) => created.push(mockup)));
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dms-mockups-created-"));
    await writeMockup(root, "desk", "Desk");
    store = new MockupStore(root);
    created = [];
  });

  afterEach(async () => {
    stops.splice(0).forEach((stop) => stop());
    store.close();
    await rm(root, { recursive: true, force: true });
  });

  it("sends a mockup that did not exist, with its title, and none of those there before (fails a stream that replays the list)", async () => {
    await listen();
    await writeMockup(root, "orders", "Orders desk");

    const seen = await until(() => created.length > 0);
    await quiet();

    expect(seen).to.equal(true);
    expect(created).to.deep.equal([{ name: "orders", title: "Orders desk" }]);
  });

  it("sends nothing for an update or a retitle of a mockup that exists (fails a stream that fires on any write)", async () => {
    await listen();
    await writeMockup(root, "desk", "Renamed desk");
    await quiet();
    await writeMockup(root, "desk", "Renamed again");
    await quiet();

    expect(created).to.deep.equal([]);
  });

  it("sees a mockup whose directory is made before its spec", async () => {
    await listen();
    await mkdir(join(root, "late"));
    await quiet();
    expect(created).to.deep.equal([]);

    await writeFile(join(root, "late", "spec.json"), spec("Late"));

    expect(await until(() => created.length === 1)).to.equal(true);
    expect(created[0]).to.deep.equal({ name: "late", title: "Late" });
  });

  it("sees the first mockup when the mockups directory does not exist yet", async () => {
    const empty = join(root, "not-yet");
    store.close();
    store = new MockupStore(empty);
    await listen();

    await writeMockup(empty, "first", "First");

    expect(await until(() => created.length === 1)).to.equal(true);
    expect(created[0].name).to.equal("first");
  });

  it("sends a mockup once, and again when it is deleted and made anew", async () => {
    await listen();
    await writeMockup(root, "twice", "Twice");
    expect(await until(() => created.length === 1)).to.equal(true);
    await quiet();
    expect(created).to.have.length(1);

    await rm(join(root, "twice"), { recursive: true });
    await quiet();
    await writeMockup(root, "twice", "Twice");

    expect(await until(() => created.length === 2)).to.equal(true);
  });

  it("stops sending to a listener that unsubscribed and reads nothing once the last has", async () => {
    await listen();
    stops.splice(0).forEach((stop) => stop());

    await writeMockup(root, "after", "After");
    await quiet();

    expect(created).to.deep.equal([]);
  });

  it("tells every subscriber, as two open dashboards are", async () => {
    const second: MockupCreated[] = [];
    await listen();
    stops.push(await store.subscribeCreated((mockup) => second.push(mockup)));

    await writeMockup(root, "both", "Both");

    expect(
      await until(() => created.length === 1 && second.length === 1),
    ).to.equal(true);
  });
});
