/**
 * @vitest-environment jsdom
 * @packageDocumentation
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCKUP_WRITE_DELAY_MS } from "../layers/dms-ui/app/entries/composables/block-preview/useMockupSpec";
import { MOCKUP_LOCK_RENEW_MS } from "../layers/dms-ui/app/entries/composables/block-preview/useMockupLocks";
import type { MockupBlockType } from "../layers/dms-ui/app/entries/utils/mockupCatalog";
import type { MockupSpecDocument } from "../layers/dms-ui/app/entries/utils/mockupSpec";
import {
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  stubMockupRuntime,
  type MockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const KPI: MockupBlockType = {
  type: "KpiCard",
  componentName: "dms-kpi-card",
  meta: { name: "KPI card", group: "visualization" },
  config: {
    title: { type: "string", ui: { label: "Title", group: "content" } },
  },
  defaults: {},
};

const FIRST = "/pages/0/tree/0";

function spec(): MockupSpecDocument {
  return {
    version: 1,
    pages: [
      {
        id: "orders",
        title: "Orders",
        tree: [
          { id: "revenue", type: "KpiCard", options: { title: "Revenue" } },
          { id: "orders", type: "KpiCard", options: { title: "Orders" } },
        ],
      },
    ],
  };
}

const STATE = mockupState({
  pages: [
    mockupPage({
      options: {},
      tree: [],
      paths: { "block-0": FIRST, "block-1": "/pages/0/tree/1" },
    }),
  ],
});
const RECTS = [
  { path: "block-0", rect: { x: 0, y: 40, width: 400, height: 100 } },
  { path: "block-1", rect: { x: 0, y: 160, width: 400, height: 100 } },
];
const BEA = { name: "Bea", mine: false, page: "orders", path: FIRST };

let runtime: MockupRuntime;
let viewer: MountedViewer;

const find = (selector: string) =>
  viewer.host.querySelector<HTMLElement>(selector);
const titleField = () =>
  viewer.host.querySelector<HTMLInputElement>(
    "[data-dms-mockup-field=title] input",
  );
const taken = () => runtime.locks.filter((lock) => lock.method === "PUT");
const freed = () => runtime.locks.filter((lock) => lock.method === "DELETE");
const specWrites = () =>
  runtime.authFetch.mock.calls.filter(
    ([url, init]) => url === "/api/mockup/demo/spec" && init?.method === "PUT",
  );

async function pick(path: string): Promise<void> {
  await viewer.say({ type: "select", path });
  await viewer.say({ type: "layout", blocks: RECTS });
}

async function click(selector: string): Promise<void> {
  find(selector)?.click();
  await flush();
}

async function type(title: string): Promise<void> {
  const field = titleField();
  if (!field) throw new Error("no title field");
  field.value = title;
  field.dispatchEvent(new Event("input"));
  await flush();
}

function press(key: string): Promise<void> {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
  return flush();
}

async function settled(): Promise<void> {
  await new Promise((resolve) =>
    setTimeout(resolve, MOCKUP_WRITE_DELAY_MS + 50),
  );
  await flush();
  await viewer.publish(
    "state",
    mockupState({
      revision: 100 + runtime.file.version,
      pages: STATE.pages,
    }),
  );
}

beforeEach(async () => {
  runtime = stubMockupRuntime({ spec: spec(), blocks: [KPI] });
  viewer = await mountViewer();
  viewer.stream.emit("open", {});
  await viewer.publish("state", STATE);
  await viewer.say({ type: "ready" });
});

afterEach(() => {
  viewer.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the lock of the selected block", () => {
  it("is taken for the block selected, under the id the stream was opened with, and freed when the selection goes (fails when no lock is asked for, or none is let go)", async () => {
    const id = new URL(viewer.stream.url).searchParams.get("viewer");

    await pick("block-0");
    expect(taken()).toEqual([
      expect.objectContaining({ method: "PUT", viewer: id, path: FIRST }),
    ]);

    await press("Escape");
    expect(freed()).toEqual([{ method: "DELETE", viewer: id }]);
  });

  it("is freed only once the edit made under it is written (fails when a deselect frees the block before its last edit is saved)", async () => {
    await pick("block-0");
    await type("Turnover");

    await press("Escape");
    expect(freed()).toHaveLength(0);

    await settled();
    expect(freed()).toHaveLength(1);
    expect(runtime.file.spec.pages[0]?.tree[0]?.options?.title).toBe(
      "Turnover",
    );
  });

  it("is taken again when the stream reopens, the backend having freed it with the stream (fails when a reconnect leaves the block unlocked)", async () => {
    await pick("block-0");
    expect(taken()).toHaveLength(1);

    viewer.stream.emit("error", {});
    await flush();
    viewer.stream.emit("open", {});
    await flush();

    expect(taken()).toHaveLength(2);
  });

  it("is renewed by an edit, once every MOCKUP_LOCK_RENEW_MS at most (fails when every keystroke renews it, or none does)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await pick("block-0");
    expect(taken()).toHaveLength(1);

    await type("T");
    await type("Tu");
    expect(taken()).toHaveLength(1);

    vi.setSystemTime(Date.now() + MOCKUP_LOCK_RENEW_MS + 1);
    await type("Tur");
    await type("Turn");
    expect(taken()).toHaveLength(2);
  });

  it("is renewed without naming a block, which another viewer's write may have moved (fails when a renewal sends the pointer the lock was taken at)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await pick("block-0");

    vi.setSystemTime(Date.now() + MOCKUP_LOCK_RENEW_MS + 1);
    await type("T");

    expect(taken()).toHaveLength(2);
    expect(taken()[1]?.path).toBeUndefined();
  });

  it("is taken again once the edit is written, when a renewal finds it gone (fails when a lock that ran out stays lost until another block is selected)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await pick("block-0");
    runtime.holding.clear();

    vi.setSystemTime(Date.now() + MOCKUP_LOCK_RENEW_MS + 1);
    await type("T");
    await settled();

    expect(taken().map((request) => request.path)).toEqual([
      FIRST,
      undefined,
      FIRST,
    ]);
    expect(runtime.holding.size).toBe(1);
  });
});

describe("the lock take names the spec the editor shows", () => {
  it("carries the digest of the file the editor last read or wrote, never the first one it read (fails when the take sends no digest, or one that is never updated)", async () => {
    await pick("block-0");
    expect(taken().map((request) => request.digest)).toEqual(["d1"]);

    await type("Turnover");
    await settled();
    await pick("block-1");

    expect(taken().map((request) => request.digest)).toEqual(["d1", "d2"]);
  });

  it("is taken again once the refresh arrives, on the block the selection followed, when a write that landed first refused the take as stale (fails when the stale take is never retried, or is retried before the selection followed its block)", async () => {
    const theirs = spec();
    theirs.pages[0]?.tree.unshift({
      id: "b-new00001",
      type: "KpiCard",
      options: { title: "New" },
    });
    runtime.file.spec = theirs;
    runtime.file.version += 1;
    runtime.file.writtenBy = { name: "Bea" };

    await pick("block-0");
    expect(runtime.holding.size).toBe(0);

    await viewer.publish(
      "state",
      mockupState({ revision: 100 + runtime.file.version, pages: STATE.pages }),
    );

    expect(taken().map(({ path, digest }) => ({ path, digest }))).toEqual([
      { path: FIRST, digest: "d1" },
      { path: "/pages/0/tree/1", digest: "d2" },
    ]);
    expect([...runtime.holding.values()]).toEqual(["revenue"]);
  });
});

describe("the edit under a lock while another viewer writes", () => {
  const titles = () =>
    runtime.file.spec.pages[0]?.tree.map((node) => node.options?.title);

  async function theyWrite(change: (theirs: MockupSpecDocument) => void) {
    const theirs = structuredClone(runtime.file.spec);
    change(theirs);
    runtime.file.spec = theirs;
    runtime.file.version += 1;
    runtime.file.writtenBy = { name: "Bea" };
    await viewer.publish(
      "state",
      mockupState({ revision: 100 + runtime.file.version, pages: STATE.pages }),
    );
  }

  async function landed(): Promise<void> {
    await new Promise((resolve) =>
      setTimeout(resolve, MOCKUP_WRITE_DELAY_MS * 3 + 100),
    );
    await flush();
  }

  it("is kept when another viewer inserted a block above the held one and took it, the lock having been renewed meanwhile (fails when a renewal moves the lock to the block now at the old pointer, which the other viewer holds, and the typing is dropped)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await pick("block-0");
    vi.setSystemTime(Date.now() + MOCKUP_LOCK_RENEW_MS + 1);
    await type("Tu");

    await theyWrite((theirs) => {
      theirs.pages[0]?.tree.unshift({
        id: "b-new00001",
        type: "KpiCard",
        options: { title: "New" },
      });
    });
    runtime.rivals.add("b-new00001");
    vi.setSystemTime(Date.now() + MOCKUP_LOCK_RENEW_MS + 1);
    await type("Tur");
    await landed();

    expect(titles()).toEqual(["New", "Tur", "Orders"]);
    expect(runtime.toasts).toEqual([]);
  });

  it("is kept when this session moved the held block and typed in it before the stream sent the state of the move (fails when the held block is looked for at the pointer it was taken at)", async () => {
    await pick("block-0");
    await click("[data-dms-mockup-move-down]");
    await new Promise((resolve) =>
      setTimeout(resolve, MOCKUP_WRITE_DELAY_MS + 50),
    );
    await flush();
    expect(titles()).toEqual(["Orders", "Revenue"]);
    expect(titleField()?.value).toBe("Revenue");

    await type("Mine");
    await theyWrite((theirs) => {
      const [first] = theirs.pages[0]?.tree ?? [];
      if (first?.options) first.options.title = "Sales";
    });
    await landed();

    expect(titles()).toEqual(["Sales", "Mine"]);
  });
});

describe("the lock after the last edit of its holder", () => {
  it("is not renewed by a write of another viewer, so a holder who walked away lets it run out (fails when every change of the spec renews it)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await pick("block-0");
    expect(taken()).toHaveLength(1);

    vi.setSystemTime(Date.now() + MOCKUP_LOCK_RENEW_MS + 1);
    const theirs = spec();
    const second = theirs.pages[0]?.tree[1];
    if (second?.options) second.options.title = "Sales";
    runtime.file.spec = theirs;
    runtime.file.version += 1;
    runtime.file.writtenBy = { name: "Bea" };
    await viewer.publish(
      "state",
      mockupState({ revision: 100 + runtime.file.version, pages: STATE.pages }),
    );

    expect(taken()).toHaveLength(1);
  });

  it("is renewed before it is freed, never after: a renewal still on its way holds the release back (fails when a renewal runs beside the lock requests and can put the block back after the release)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await pick("block-0");
    vi.setSystemTime(Date.now() + MOCKUP_LOCK_RENEW_MS + 1);
    const answer = runtime.holdLocks();

    await type("Turnover");
    await press("Escape");
    await settled();
    expect(taken()).toHaveLength(2);
    expect(freed()).toHaveLength(0);

    answer();
    await flush();
    await flush();

    expect(freed()).toHaveLength(1);
    expect(runtime.locks.map((request) => request.method)).toEqual([
      "PUT",
      "PUT",
      "DELETE",
    ]);
  });
});

describe("deselecting the block, which is how its holder lets go of the lock", () => {
  const selected = () => find("[data-dms-mockup-inspector-fields]") !== null;

  function escapeIn(target: HTMLElement): Promise<void> {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    return flush();
  }

  it("follows an Escape pressed in an inspector field, once the typing is written (fails when a key pressed in a field is left to the field, or when the typing is dropped)", async () => {
    await pick("block-0");
    await type("Turnover");
    const field = titleField();
    if (!field) throw new Error("no title field");

    await escapeIn(field);
    expect(selected()).toBe(false);
    expect(freed()).toHaveLength(0);

    await settled();
    expect(freed()).toHaveLength(1);
    expect(runtime.file.spec.pages[0]?.tree[0]?.options?.title).toBe(
      "Turnover",
    );
  });

  it("is not done by an Escape pressed in a field outside the inspector (fails when every field hands its Escape to the viewer)", async () => {
    await pick("block-0");
    const outside = document.createElement("input");
    viewer.host.append(outside);

    await escapeIn(outside);

    expect(selected()).toBe(true);
    expect(freed()).toHaveLength(0);
  });

  it("is not done by an Escape the field already took (fails when an Escape that closed a layer of the field also deselects)", async () => {
    await pick("block-0");
    const field = titleField();
    if (!field) throw new Error("no title field");
    field.addEventListener("keydown", (event) => event.preventDefault());

    await escapeIn(field);

    expect(selected()).toBe(true);
  });

  it("follows a click on the empty canvas around the page, right after an edit still being written, and frees the lock once it is (fails when the canvas takes no click, or drops it while an edit is pending)", async () => {
    await pick("block-0");
    await type("Turnover");

    await click("[data-dms-mockup-canvas]");
    expect(selected()).toBe(false);
    expect(freed()).toHaveLength(0);

    await settled();
    expect(freed()).toHaveLength(1);
    expect(runtime.file.spec.pages[0]?.tree[0]?.options?.title).toBe(
      "Turnover",
    );
  });

  it("is not done by a click on the canvas toolbar, which acts on the block (fails when the canvas takes every click inside it, the toolbar's included)", async () => {
    await pick("block-0");

    await click("[data-dms-mockup-move-down]");

    expect(selected()).toBe(true);
    expect(freed()).toHaveLength(0);
  });

  it("follows a click on the empty page, right after an edit still being written, and frees the lock once it is (fails when a click is dropped while an edit is pending)", async () => {
    await pick("block-0");
    await type("Turnover");

    await viewer.say({ type: "select-page" });
    expect(selected()).toBe(false);
    expect(freed()).toHaveLength(0);

    await settled();
    expect(freed()).toHaveLength(1);
    expect(runtime.file.spec.pages[0]?.tree[0]?.options?.title).toBe(
      "Turnover",
    );
  });
});

describe("a block another viewer holds", () => {
  beforeEach(async () => {
    await viewer.publish("presence", {
      viewers: [{ name: "Bea", mine: false }],
      locks: [BEA],
    });
  });

  it("shows the holder's name in the inspector, read-only, with no lock asked for and no edit written (fails when the fields stay editable or the lock is requested anyway)", async () => {
    await pick("block-0");

    expect(find("[data-dms-mockup-locked]")?.textContent).toContain(
      "dms.mockup.locked_by Bea",
    );
    expect(
      find("[data-dms-mockup-inspector-fields]")?.hasAttribute("inert"),
    ).toBe(true);
    await type("Mine");
    await settled();
    expect(specWrites()).toHaveLength(0);
    expect(runtime.file.spec).toEqual(spec());
    expect(taken()).toHaveLength(0);
  });

  it("hides the canvas toolbar of that block, and shows the holder on its row of the Layers tab (fails when the toolbar still offers to move or remove it)", async () => {
    await pick("block-0");
    expect(find("[data-dms-mockup-toolbar]")).toBeNull();

    find("[data-dms-mockup-panel-tab=layers]")?.click();
    await flush();
    const row = find(`[data-dms-mockup-layer="${FIRST}"]`);
    expect(row?.textContent).toContain("Bea");
    expect(
      find('[data-dms-mockup-layer="/pages/0/tree/1"]')?.textContent,
    ).not.toContain("Bea");
  });

  it("is editable again, and locked for this session, once its holder lets go (fails when the read-only state outlives the other viewer's lock)", async () => {
    await pick("block-0");
    await viewer.publish("presence", { viewers: [], locks: [] });

    expect(find("[data-dms-mockup-locked]")).toBeNull();
    expect(taken()).toHaveLength(1);
    await type("Mine");
    await settled();
    expect(runtime.file.spec.pages[0]?.tree[0]?.options?.title).toBe("Mine");
  });

  it("never blocks this session when the stream marks the lock as its own (fails when every lock of the event blocks)", async () => {
    await viewer.publish("presence", {
      viewers: [{ name: "Me", mine: true }],
      locks: [{ ...BEA, name: "Me", mine: true }],
    });
    await pick("block-0");

    expect(find("[data-dms-mockup-locked]")).toBeNull();
    expect(taken()).toHaveLength(1);
  });

  it("leaves another block of the page editable (fails when one held block locks the whole page)", async () => {
    await pick("block-1");

    expect(find("[data-dms-mockup-locked]")).toBeNull();
    expect(taken()).toEqual([
      expect.objectContaining({ path: "/pages/0/tree/1" }),
    ]);
  });
});

describe("a change from another viewer", () => {
  async function outsideWrites(title: string, by?: { name: string }) {
    const theirs = spec();
    const second = theirs.pages[0]?.tree[1];
    if (second?.options) second.options.title = title;
    runtime.file.spec = theirs;
    runtime.file.version += 1;
    runtime.file.writtenBy = by;
    await viewer.publish(
      "state",
      mockupState({
        revision: 100 + runtime.file.version,
        pages: STATE.pages,
      }),
    );
  }

  it("is taken in without the notice of a file changed on disk, which an AI's change still gets (fails when every outside change toasts)", async () => {
    await outsideWrites("Sales", { name: "Bea" });
    expect(runtime.toasts).toEqual([]);

    await outsideWrites("Marketing");
    expect(runtime.toasts).toEqual([
      expect.objectContaining({ title: "dms.mockup.adopted" }),
    ]);
  });
});
