/** @vitest-environment jsdom */
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockupAnnotation } from "../layers/dms-ui/app/entries/utils/mockup";
import {
  annotation,
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  rendered,
  stubMockupRuntime,
  type MockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const HISTORY_URL = "/api/mockup/demo/history";
const OLD_TITLE = "Old revenue";
const NEW_TITLE = "Fresh revenue";

function stateTitled(title: string, revision: number) {
  return mockupState({
    revision,
    pages: [mockupPage({ tree: [{ type: "KpiCard", options: { title } }] })],
  });
}

const LIVE = stateTitled("Revenue", 1);

function summary(
  seq: number,
  by: "ai" | "you" | "disk",
  text: string,
  comments = 0,
) {
  return {
    seq,
    by,
    comments,
    summary: text,
    at: new Date(Date.now() - seq * 60_000).toISOString(),
  };
}

let versions = [
  summary(3, "you", "Changed Orders"),
  summary(2, "ai", "Added Orders"),
  summary(1, "disk", "Created with 1 page"),
];

/** The notes the fake backend serves as pinned on each version, as that version's spec locates them. */
let versionNotes = new Map<number, MockupAnnotation[]>();

/** The compiled state the fake backend serves for any version. */
let versionState = stateTitled(OLD_TITLE, 0);

let runtime: MockupRuntime;
let viewer: MountedViewer;

/** What the fake backend answers: the history routes, and the plain ones the viewer reads on mount. */
async function answer(url: string): Promise<object> {
  await Promise.resolve();
  if (url === HISTORY_URL) return { versions };
  if (url === `${HISTORY_URL}/1/restore`) return { ok: true, digest: "d9" };
  const one = /\/history\/(\d+)$/.exec(url);
  if (one) {
    const seq = Number(one[1]);
    return {
      ...versions.find((version) => version.seq === seq),
      spec: {},
      state: versionState,
      annotations: versionNotes.get(seq) ?? [],
    };
  }
  if (url.endsWith("/spec")) return { spec: runtime.file.spec, digest: "d1" };
  if (url.endsWith("/schema/blocks")) return { blocks: [] };
  return { annotations: runtime.notes };
}

async function mount(): Promise<void> {
  runtime = stubMockupRuntime();
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en-GB"),
    t: (key: string, params?: Record<string, number>) =>
      params ? `${key} ${Object.values(params).join(",")}` : key,
  }));
  runtime.authFetch.mockImplementation(answer);
  viewer = await mountViewer();
  await viewer.publish("state", LIVE);
  await viewer.say({ type: "ready" });
}

beforeEach(() => {
  versionNotes = new Map();
  versionState = stateTitled(OLD_TITLE, 0);
  versions = [
    summary(3, "you", "Changed Orders"),
    summary(2, "ai", "Added Orders"),
    summary(1, "disk", "Created with 1 page"),
  ];
});

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

const find = (selector: string) =>
  viewer.host.querySelector<HTMLElement>(selector);
const findAll = (selector: string) => [
  ...viewer.host.querySelectorAll<HTMLElement>(selector),
];

async function click(selector: string): Promise<void> {
  find(selector)?.click();
  await flush();
}

async function openHistory(): Promise<void> {
  await click("[data-dms-mockup-history]");
}

async function preview(seq: number): Promise<void> {
  await click(`[data-dms-mockup-version="${seq}"]`);
}

function lastTitle() {
  const tree = rendered(viewer.posted).at(-1)?.tree;
  const [first] = Array.isArray(tree) ? tree : [tree];
  return first?.options?.title;
}

function pressEscape(): Promise<void> {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  return flush();
}

describe("mockup version history: the list", () => {
  it("opens from the top bar and lists the versions newest first, by whom and what changed", async () => {
    await mount();
    expect(find("[data-dms-mockup-history-panel]")).toBeNull();

    await openHistory();

    const rows = findAll("[data-dms-mockup-version]");
    expect(rows.map((row) => row.dataset.dmsMockupVersion)).toEqual([
      "3",
      "2",
      "1",
    ]);
    expect(rows[0]?.textContent).toContain("Changed Orders");
    expect(rows[0]?.textContent).toContain("dms.mockup.history_by_you");
    expect(rows[1]?.textContent).toContain("dms.mockup.history_by_ai");
    expect(rows[2]?.textContent).toContain("dms.mockup.history_by_disk");
    expect(rows[0]?.textContent).toContain("dms.mockup.history_current");
    expect(rows[0]?.querySelector("time")?.getAttribute("datetime")).toBe(
      versions[0]?.at,
    );
  });

  it("marks the open panel on its button, and closes it with the close button", async () => {
    await mount();
    await openHistory();
    expect(
      find("[data-dms-mockup-history]")?.getAttribute("aria-pressed"),
    ).toBe("true");

    await click("[data-dms-mockup-history-close]");

    expect(find("[data-dms-mockup-history-panel]")).toBeNull();
  });

  it("says so when the history cannot be loaded", async () => {
    await mount();
    runtime.authFetch.mockImplementationOnce(async () => {
      throw new Error("offline");
    });

    await openHistory();

    expect(find("[data-dms-mockup-history-failed]")).not.toBeNull();
  });
});

describe("mockup version history: previewing a version", () => {
  it("draws it read-only with a banner that names it, in place of the current page", async () => {
    await mount();
    await openHistory();

    await preview(1);

    expect(lastTitle()).toBe(OLD_TITLE);
    expect(find("[data-dms-mockup-version-banner]")?.textContent).toContain(
      "dms.mockup.history_viewing 1",
    );
    expect(find("[data-dms-mockup-overlay]")).toBeNull();
    expect(find("[data-dms-mockup-pin-capture]")).toBeNull();
    expect(find("[data-dms-mockup-undo]")?.hasAttribute("disabled")).toBe(true);
  });

  it("draws the page header of the version, not the current page's, over the previewed blocks (fails when a version is drawn without its header)", async () => {
    versionState = mockupState({
      revision: 0,
      pages: [
        mockupPage({
          title: "Orders then",
          icon: "i-ph-archive",
          description: "How the page read back then",
          headerActions: [{ label: "Export", variant: "outline" }],
        }),
      ],
    });
    await mount();
    expect(rendered(viewer.posted).at(-1)?.header).toEqual({ title: "Orders" });
    await openHistory();

    await preview(1);

    expect(rendered(viewer.posted).at(-1)?.header).toEqual({
      title: "Orders then",
      icon: "i-ph-archive",
      description: "How the page read back then",
      actions: [{ label: "Export", variant: "outline" }],
    });
  });

  it("gives a previewed version the page's minimum height, the canvas's visible height, as the current page gets it (fails when a short past version stops at its content)", async () => {
    const sizeCallbacks: ((entries: unknown[]) => void)[] = [];
    class FakeResizeObserver {
      constructor(callback: (entries: unknown[]) => void) {
        sizeCallbacks.push(callback);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const resizeCanvas = async (height: number) => {
      for (const callback of sizeCallbacks) {
        callback([{ contentRect: { width: 1400, height } }]);
      }
      await flush();
    };
    const floorsAfterRender = () =>
      viewer.posted
        .slice(
          viewer.posted.findLastIndex((message) => message.type === "render"),
        )
        .flatMap((message) =>
          message.type === "min-height" ? [message.height] : [],
        );
    await mount();
    await resizeCanvas(700);
    await openHistory();

    await preview(1);
    expect(lastTitle()).toBe(OLD_TITLE);
    expect(floorsAfterRender()).toEqual([700]);

    await resizeCanvas(900);
    expect(floorsAfterRender()).toEqual([700, 900]);
    expect(find("iframe")?.style.height).toBe("900px");
  });

  it("keeps the preview when the spec changes, and says a newer version arrived", async () => {
    await mount();
    await openHistory();
    await preview(1);
    expect(find("[data-dms-mockup-newer]")).toBeNull();

    versions = [summary(4, "ai", "Changed Orders"), ...versions];
    await viewer.publish("state", stateTitled(NEW_TITLE, 2));

    expect(lastTitle()).toBe(OLD_TITLE);
    expect(find("[data-dms-mockup-newer]")).not.toBeNull();
    expect(findAll("[data-dms-mockup-version]")).toHaveLength(4);
  });

  it("does not call a stream that reconnects with the same spec a newer version", async () => {
    await mount();
    await openHistory();
    await preview(1);

    await viewer.publish("state", stateTitled("Revenue", 2));

    expect(find("[data-dms-mockup-newer]")).toBeNull();
  });

  it("goes back to the current spec with Back to current, Escape or the newest version", async () => {
    await mount();
    await openHistory();

    for (const leave of [
      () => click("[data-dms-mockup-back-to-current]"),
      pressEscape,
      () => click(`[data-dms-mockup-version="3"]`),
    ]) {
      await preview(1);
      expect(find("[data-dms-mockup-version-banner]")).not.toBeNull();

      await leave();

      expect(find("[data-dms-mockup-version-banner]")).toBeNull();
      expect(lastTitle()).toBe("Revenue");
    }
  });

  it("lets go of the preview when the panel closes", async () => {
    await mount();
    await openHistory();
    await preview(2);

    await click("[data-dms-mockup-history-close]");

    expect(find("[data-dms-mockup-version-banner]")).toBeNull();
    expect(lastTitle()).toBe("Revenue");
  });
});

describe("mockup version history: restoring", () => {
  const restores = () =>
    runtime.authFetch.mock.calls.filter(([url]) =>
      String(url).endsWith("/restore"),
    );

  it("asks before it restores, and sends nothing when the developer cancels", async () => {
    await mount();
    await openHistory();
    await preview(1);

    await click("[data-dms-mockup-restore]");

    const dialog = find("[role=dialog]");
    expect(dialog?.getAttribute("aria-label")).toBe(
      "dms.mockup.history_restore_title 1",
    );
    expect(restores()).toHaveLength(0);

    await click("[data-dms-mockup-restore-cancel]");

    expect(find("[role=dialog]")).toBeNull();
    expect(restores()).toHaveLength(0);
    expect(find("[data-dms-mockup-version-banner]")).not.toBeNull();
  });

  it("restores once confirmed, leaves the preview and says so", async () => {
    await mount();
    await openHistory();
    await preview(1);
    await click("[data-dms-mockup-restore]");

    await click("[data-dms-mockup-restore-confirm]");

    expect(restores()).toEqual([
      [`${HISTORY_URL}/1/restore`, { method: "POST" }],
    ]);
    expect(find("[data-dms-mockup-version-banner]")).toBeNull();
    expect(runtime.toasts).toContainEqual(
      expect.objectContaining({
        title: "dms.mockup.history_restored 1",
      }),
    );
  });

  it("keeps the preview and explains a restore the spec checks refuse", async () => {
    await mount();
    await openHistory();
    await preview(1);
    runtime.authFetch.mockImplementation(async (url: string) =>
      url.endsWith("/restore")
        ? {
            ok: false,
            errors: [{ path: "/pages/0", message: "unknown block" }],
          }
        : answer(url),
    );
    await click("[data-dms-mockup-restore]");

    await click("[data-dms-mockup-restore-confirm]");

    expect(find("[data-dms-mockup-version-banner]")).not.toBeNull();
    expect(runtime.toasts).toContainEqual(
      expect.objectContaining({
        title: "dms.mockup.history_restore_refused",
        description: "/pages/0: unknown block",
      }),
    );
  });
});

const FRAME_HEIGHT = 600;
const LAYOUT = [
  { path: "block-0", rect: { x: 0, y: 40, width: 400, height: 100 } },
];

const PLACED_ON_ONE = annotation({
  id: "on-one",
  text: "Too tight",
  status: "resolved",
  version: 1,
  resolvedVersion: 3,
  offset: { x: 0.5, y: 0.5 },
});
const STILL_OPEN = annotation({
  id: "open-one",
  text: "Add a total",
  version: 3,
});

async function mountWithPins(): Promise<void> {
  runtime = stubMockupRuntime({
    notes: [PLACED_ON_ONE, STILL_OPEN],
  });
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en-GB"),
    t: (key: string, params?: Record<string, number>) =>
      params ? `${key} ${Object.values(params).join(",")}` : key,
  }));
  runtime.authFetch.mockImplementation(answer);
  viewer = await mountViewer();
  await viewer.publish("state", LIVE);
  await viewer.say({ type: "ready" });
  await viewer.say({ type: "resize", height: FRAME_HEIGHT });
  await viewer.say({ type: "layout", blocks: LAYOUT });
}

describe("mockup version history: the comments of a version", () => {
  beforeEach(() => {
    versions = [
      summary(3, "you", "Changed Orders", 1),
      summary(2, "ai", "Added Orders"),
      summary(1, "disk", "Created with 1 page", 2),
    ];
    versionNotes = new Map([[1, [PLACED_ON_ONE]]]);
  });

  it("counts, in the list, the comments pinned on each version, and shows no count for a version with none (fails when a version with no comment shows a zero or the count is dropped)", async () => {
    await mountWithPins();
    await openHistory();

    const counts = findAll("[data-dms-mockup-version]").map((row) =>
      row
        .querySelector("[data-dms-mockup-version-comments]")
        ?.getAttribute("data-dms-mockup-version-comments"),
    );

    expect(counts).toEqual(["1", undefined, "2"]);
  });

  it("shows the current spec's open pins only, and none of the resolved ones (fails when a resolved pin shows on the current version)", async () => {
    await mountWithPins();

    expect(find('[data-dms-mockup-pin="open-one"]')).not.toBeNull();
    expect(find('[data-dms-mockup-pin="on-one"]')).toBeNull();
  });

  it("previews a version with the pins placed on it, resolved ones included and marked, in place of the current ones (fails when the preview shows the current pins or hides the resolved one)", async () => {
    await mountWithPins();
    await openHistory();

    await preview(1);

    const pin = find('[data-dms-mockup-pin="on-one"]');
    expect(pin?.getAttribute("data-status")).toBe("resolved");
    expect(find('[data-dms-mockup-pin="open-one"]')).toBeNull();
    expect(pin?.style).toMatchObject({ left: "200px", top: "90px" });

    pin?.click();
    await flush();

    const card = find('[data-dms-mockup-pin-card="on-one"]');
    expect(card?.textContent).toContain("Too tight");
    expect(card?.textContent).toContain("dms.mockup.pin_resolved_in 3");
  });

  it("keeps the preview's pins read-only: no placing, no drag, no status, text or delete (fails when a pin of a past version can be changed)", async () => {
    await mountWithPins();
    await openHistory();
    await preview(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }));
    await flush();
    const pin = find('[data-dms-mockup-pin="on-one"]');
    expect(pin).not.toBeNull();
    pin?.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 1, clientY: 1, bubbles: true }),
    );
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 300, clientY: 90 }),
    );
    window.dispatchEvent(
      new MouseEvent("pointerup", { clientX: 300, clientY: 90 }),
    );
    await flush();
    pin?.click();
    await flush();

    expect(find("[data-dms-mockup-pin-capture]")).toBeNull();
    expect(find("[data-dms-mockup-pin-status]")).toBeNull();
    expect(find("[data-dms-mockup-pin-delete]")).toBeNull();
    expect(find('[data-dms-mockup-pin-card="on-one"] textarea')).toBeNull();
    const writes = runtime.authFetch.mock.calls.filter(
      ([, init]) => init?.method,
    );
    expect(writes).toEqual([]);
  });

  it("brings the current pins back with the current spec (fails when the preview's pins stay)", async () => {
    await mountWithPins();
    await openHistory();
    await preview(1);

    await click("[data-dms-mockup-back-to-current]");

    expect(find('[data-dms-mockup-pin="open-one"]')).not.toBeNull();
    expect(find('[data-dms-mockup-pin="on-one"]')).toBeNull();
  });

  it("drops a pin deleted since the preview was fetched (fails when a deleted note stays in the preview)", async () => {
    await mountWithPins();
    await openHistory();
    await preview(1);
    expect(find('[data-dms-mockup-pin="on-one"]')).not.toBeNull();

    await viewer.publish("annotations", { annotations: [STILL_OPEN] });

    expect(find('[data-dms-mockup-pin="on-one"]')).toBeNull();
  });
});

describe("mockup version history: converted pages", () => {
  it("draws a version's page converted from a live page on its live tree and the frame that allows live routes, as the current page is (fails when a version is always drawn on fixtures)", async () => {
    const realTree = [{ type: "KpiCard", options: { fetchUrl: "/api/kpi" } }];
    versionState = mockupState({
      pages: [
        mockupPage({
          tree: [{ type: "KpiCard", options: { title: OLD_TITLE } }],
          realTree,
          livePage: { ref: "/orders" },
        }),
      ],
    });
    await mount();
    await openHistory();
    await preview(1);
    await viewer.say({ type: "ready" });

    expect(find("iframe")?.getAttribute("src")).toBe("/dms-preview");
    expect(rendered(viewer.posted).at(-1)?.tree).toEqual(realTree);
  });
});
