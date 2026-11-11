/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  annotation,
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  stubMockupRuntime,
  type MockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const POINTER = "/pages/0/tree/1/children/0";
const STATE = mockupState({
  pages: [mockupPage({ paths: { "block-1.kpi": POINTER } })],
});
const ANNOTATIONS_URL = "/api/mockup/demo/annotations";

let runtime: MockupRuntime;
let viewer: MountedViewer;

beforeEach(async () => {
  runtime = stubMockupRuntime();
  viewer = await mountViewer();
  await viewer.publish("state", STATE);
  await viewer.say({ type: "ready" });
});

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

const annotateToggle = () =>
  viewer.host.querySelector<HTMLElement>("[data-dms-mockup-annotate]");
const compose = () => viewer.host.querySelector("[data-dms-mockup-compose]");
const writes = () =>
  runtime.authFetch.mock.calls.filter(([, init]) => init?.method);

async function annotate(): Promise<void> {
  annotateToggle()?.click();
  await flush();
}

async function type(text: string): Promise<void> {
  const field = viewer.host.querySelector("textarea");
  if (!field) throw new Error("No note box is open");
  field.value = text;
  field.dispatchEvent(new Event("input"));
  await flush();
}

async function save(): Promise<void> {
  viewer.host.querySelector<HTMLElement>("[data-dms-mockup-save]")?.click();
  await flush();
}

describe("annotate mode", () => {
  it("tells the preview to inspect while on, and to stop when off", async () => {
    await annotate();
    expect(viewer.posted.at(-1)).toMatchObject({
      type: "inspect",
      enabled: true,
    });
    await annotate();
    expect(viewer.posted.at(-1)).toMatchObject({
      type: "inspect",
      enabled: false,
    });
  });

  it("opens no note box for a block picked while it is off", async () => {
    await viewer.say({ type: "select", path: "block-1.kpi" });
    expect(compose()).toBeNull();
    expect(writes()).toEqual([]);
  });

  it("saves a note on the spec pointer of the picked block, not its layout path", async () => {
    await annotate();
    await viewer.say({ type: "select", path: "block-1.kpi" });
    expect(compose()?.textContent).toContain(POINTER);
    await type("  Tighten the spacing ");
    await save();
    expect(runtime.authFetch).toHaveBeenCalledWith(ANNOTATIONS_URL, {
      method: "POST",
      body: { page: "orders", path: POINTER, text: "Tighten the spacing" },
    });
    expect(compose()).toBeNull();
    expect(
      viewer.host.querySelectorAll("[data-dms-mockup-annotation]"),
    ).toHaveLength(1);
  });

  it("says so when the picked block is not a node of the spec", async () => {
    await annotate();
    await viewer.say({ type: "select", path: "block-9" });
    expect(compose()).toBeNull();
    expect(viewer.host.querySelector("[role=alert]")?.textContent).toBe(
      "dms.mockup.not_in_spec",
    );
    expect(writes()).toEqual([]);
  });

  it("does not save an empty note", async () => {
    await annotate();
    await viewer.say({ type: "select", path: "block-1.kpi" });
    await type("   ");
    await save();
    expect(writes()).toEqual([]);
    expect(compose()).not.toBeNull();
  });

  it("keeps the note box open, with its text, when the save fails", async () => {
    runtime.authFetch.mockRejectedValueOnce(new Error("offline"));
    await annotate();
    await viewer.say({ type: "select", path: "block-1.kpi" });
    await type("Keep me");
    await save();
    expect(compose()).not.toBeNull();
    expect(viewer.host.querySelector("textarea")?.value).toBe("Keep me");
    expect(viewer.host.querySelector("[role=alert]")?.textContent).toBe(
      "dms.mockup.request_failed",
    );
  });

  it("drops the note box when an edit deletes the node it was on", async () => {
    await annotate();
    await viewer.say({ type: "select", path: "block-1.kpi" });
    await type("Too late");
    await viewer.publish(
      "state",
      mockupState({ revision: 2, pages: [mockupPage()] }),
    );
    expect(compose()).toBeNull();
    expect(viewer.host.querySelector("[role=alert]")?.textContent).toBe(
      "dms.mockup.target_changed",
    );
    expect(writes()).toEqual([]);
  });

  it("drops the note box when a sibling's removal moves another node into its place", async () => {
    const card = (title: string) => ({ type: "KpiCard", options: { title } });
    const shifting = (titles: string[]) =>
      mockupPage({
        tree: titles.map(card),
        paths: Object.fromEntries(
          titles.map((_, index) => [
            `block-${index}`,
            `/pages/0/tree/${index}`,
          ]),
        ),
      });
    await viewer.publish(
      "state",
      mockupState({ revision: 2, pages: [shifting(["A", "B", "C"])] }),
    );
    await annotate();
    await viewer.say({ type: "select", path: "block-1" });
    expect(compose()?.textContent).toContain("/pages/0/tree/1");

    await viewer.publish(
      "state",
      mockupState({ revision: 3, pages: [shifting(["A", "C"])] }),
    );

    expect(compose()).toBeNull();
    expect(viewer.host.querySelector("[role=alert]")?.textContent).toBe(
      "dms.mockup.target_changed",
    );
    expect(writes()).toEqual([]);
  });

  it("keeps the note box when an edit leaves its node in place", async () => {
    await annotate();
    await viewer.say({ type: "select", path: "block-1.kpi" });
    await viewer.publish("state", mockupState({ ...STATE, revision: 2 }));
    expect(compose()?.textContent).toContain(POINTER);
  });

  it("drops the open note box when annotate mode is left", async () => {
    await annotate();
    await viewer.say({ type: "select", path: "block-1.kpi" });
    await annotate();
    expect(compose()).toBeNull();
  });
});

describe("annotations panel", () => {
  const OPEN = annotation({ id: "a1", text: "Too tight" });
  const DONE = annotation({
    id: "a2",
    text: "Fixed colour",
    status: "resolved",
    resolvedAt: "2026-11-07T11:00:00.000Z",
  });

  const entries = () =>
    [...viewer.host.querySelectorAll("[data-dms-mockup-annotation]")].map(
      (entry) => [
        entry.getAttribute("data-dms-mockup-annotation"),
        entry.querySelector("p")?.textContent,
      ],
    );

  it("shows open and resolved notes as the stream sends them", async () => {
    await viewer.publish("annotations", { annotations: [DONE, OPEN] });
    expect(entries()).toEqual([
      ["open", "Too tight"],
      ["resolved", "Fixed colour"],
    ]);
  });

  it("ignores an annotations event that is not a list of notes", async () => {
    await viewer.publish("annotations", { annotations: [OPEN] });
    await viewer.publish("annotations", { annotations: [{ id: 3 }] });
    expect(entries()).toEqual([["open", "Too tight"]]);
  });

  it("loads the notes the backend already holds", async () => {
    viewer.unmount();
    runtime = stubMockupRuntime();
    runtime.notes.push(OPEN);
    viewer = await mountViewer();
    await flush();
    expect(entries()).toEqual([["open", "Too tight"]]);
  });

  it("resolves an open note with a PATCH, and reopens a resolved one", async () => {
    runtime.notes.push(OPEN, DONE);
    await viewer.publish("annotations", { annotations: [OPEN, DONE] });
    const [resolve, reopen] = viewer.host.querySelectorAll<HTMLElement>(
      "[data-dms-mockup-annotation] button",
    );
    resolve.click();
    await flush();
    expect(runtime.authFetch).toHaveBeenCalledWith(`${ANNOTATIONS_URL}/a1`, {
      method: "PATCH",
      body: { status: "resolved" },
    });
    expect(entries()).toEqual([
      ["resolved", "Too tight"],
      ["resolved", "Fixed colour"],
    ]);
    reopen.click();
    await flush();
    expect(runtime.authFetch).toHaveBeenCalledWith(`${ANNOTATIONS_URL}/a2`, {
      method: "PATCH",
      body: { status: "open" },
    });
  });
});
