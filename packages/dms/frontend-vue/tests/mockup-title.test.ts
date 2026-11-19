/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCKUP_WRITE_DELAY_MS } from "../layers/dms-ui/app/entries/composables/block-preview/useMockupSpec";
import {
  flush,
  mockupSpec,
  mockupState,
  mountViewer,
  stubMockupRuntime,
  type MockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

let runtime: MockupRuntime;
let viewer: MountedViewer;

const find = (selector: string) =>
  viewer.host.querySelector<HTMLElement>(selector);
const shownTitle = () =>
  find("[data-dms-mockup-title]")?.textContent?.replace(/\s+/g, " ").trim();

function field(): HTMLInputElement {
  const input = find("[data-dms-mockup-title-input]");
  if (!(input instanceof HTMLInputElement)) throw new Error("no title input");
  return input;
}

async function open(): Promise<HTMLInputElement> {
  find("[data-dms-mockup-title-edit]")?.click();
  await flush();
  return field();
}

async function type(input: HTMLInputElement, value: string): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event("input"));
  await flush();
}

async function key(input: HTMLInputElement, name: string): Promise<void> {
  input.dispatchEvent(new KeyboardEvent("keydown", { key: name }));
  await flush();
}

async function saved(): Promise<void> {
  await new Promise((resolve) =>
    setTimeout(resolve, MOCKUP_WRITE_DELAY_MS + 50),
  );
  await flush();
}

beforeEach(async () => {
  runtime = stubMockupRuntime({
    spec: { ...mockupSpec(), title: "Order desk" },
  });
  viewer = await mountViewer();
  await viewer.publish("state", mockupState({ title: "Order desk" }));
  await viewer.say({ type: "ready" });
});

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

describe("renaming the mockup in place", () => {
  it("opens as a focusable button holding the title, and turns into an input on a click (fails when the title cannot be reached from the keyboard)", async () => {
    const button = find("[data-dms-mockup-title-edit]");
    expect(button?.tagName).toBe("BUTTON");
    expect(button?.textContent).toContain("Order desk");
    expect(find("[data-dms-mockup-title-input]")).toBeNull();

    const input = await open();
    expect(input.value).toBe("Order desk");
    expect(find("[data-dms-mockup-title-edit]")).toBeNull();
  });

  it("saves the title on Enter into the spec, and leaves the folder name alone (fails when the name or another field changes)", async () => {
    const input = await open();
    await type(input, "  Sales hub ");
    await key(input, "Enter");
    await saved();

    expect(runtime.file.spec).toEqual({
      ...mockupSpec(),
      title: "Sales hub",
    });
    expect(shownTitle()).toBe("Sales hub");
    expect(find("[data-dms-mockup-title-input]")).toBeNull();
    expect(
      runtime.authFetch.mock.calls.every(
        ([url]) =>
          String(url).startsWith("/api/mockup/demo/") ||
          String(url) === "/api/mockup/schema/blocks",
      ),
    ).toBe(true);
  });

  it("saves the title when the input loses focus", async () => {
    const input = await open();
    await type(input, "Back office");
    input.dispatchEvent(new FocusEvent("blur"));
    await saved();

    expect(runtime.file.spec.title).toBe("Back office");
    expect(shownTitle()).toBe("Back office");
  });

  it("drops the typing on Escape and writes nothing (fails when Escape saves)", async () => {
    const version = runtime.file.version;
    const input = await open();
    await type(input, "Dropped");
    await key(input, "Escape");
    input.dispatchEvent(new FocusEvent("blur"));
    await saved();

    expect(runtime.file.version).toBe(version);
    expect(shownTitle()).toBe("Order desk");
  });

  it("refuses an empty title: Enter keeps the input open and flags it, a click away puts the title back (fails when a blank title is written)", async () => {
    const version = runtime.file.version;
    const input = await open();
    await type(input, "   ");
    await key(input, "Enter");
    expect(find("[data-dms-mockup-title-input]")).not.toBeNull();
    expect(field().getAttribute("aria-invalid")).toBe("true");

    field().dispatchEvent(new FocusEvent("blur"));
    await saved();
    expect(find("[data-dms-mockup-title-input]")).toBeNull();
    expect(runtime.file.version).toBe(version);
    expect(shownTitle()).toBe("Order desk");
  });

  it("writes nothing when the title is saved unchanged", async () => {
    const version = runtime.file.version;
    const input = await open();
    await key(input, "Enter");
    await saved();

    expect(runtime.file.version).toBe(version);
  });

  it("undoes and redoes a rename with the history of the spec (fails when the title is outside the undo history)", async () => {
    const input = await open();
    await type(input, "Sales hub");
    await key(input, "Enter");
    await saved();

    find("[data-dms-mockup-undo]")?.click();
    await saved();
    expect(runtime.file.spec.title).toBe("Order desk");
    expect(shownTitle()).toBe("Order desk");

    find("[data-dms-mockup-redo]")?.click();
    await saved();
    expect(runtime.file.spec.title).toBe("Sales hub");
    expect(shownTitle()).toBe("Sales hub");
  });

  it("tells the preview's sidebar the new title at once", async () => {
    const input = await open();
    await type(input, "Sales hub");
    await key(input, "Enter");
    await viewer.publish(
      "state",
      mockupState({ revision: 2, title: "Sales hub" }),
    );

    const last = viewer.posted.findLast((message) => message.type === "render");
    expect(last?.type === "render" && last.navigation?.title).toBe("Sales hub");
  });
});
