/**
 * @vitest-environment jsdom
 * @packageDocumentation
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MOCKUP_ASSISTANT_PROMPT_EVENT,
  MOCKUP_ASSISTANT_RUN_EVENT,
  MOCKUP_ASSISTANT_RUN_QUERY_EVENT,
  type MockupAssistantRun,
} from "../layers/dms-ui/app/utils/mockupAssistant";
import {
  annotation,
  flush,
  mockupState,
  mountViewer,
  stubMockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

let viewer: MountedViewer | undefined;
let prompts: unknown[];
let queries: number;
/** The runs the fake assistant answers a query with. */
let ongoing: MockupAssistantRun[];

function run(detail: MockupAssistantRun): void {
  window.dispatchEvent(new CustomEvent(MOCKUP_ASSISTANT_RUN_EVENT, { detail }));
}

function onPrompt(event: Event): void {
  if (!(event instanceof CustomEvent)) return;
  prompts.push(event.detail);
  event.preventDefault();
}

function onQuery(): void {
  queries += 1;
  for (const detail of ongoing) run(detail);
}

async function mount(): Promise<MountedViewer> {
  stubMockupRuntime({ notes: [annotation()] });
  const mounted = await mountViewer();
  await mounted.publish("state", mockupState());
  await mounted.publish("annotations", { annotations: [annotation()] });
  await mounted.say({ type: "ready" });
  viewer = mounted;
  return mounted;
}

const text = (shown: MountedViewer, selector: string) =>
  shown.host.querySelector(selector)?.textContent?.trim();

beforeEach(() => {
  prompts = [];
  queries = 0;
  ongoing = [];
  window.addEventListener(MOCKUP_ASSISTANT_PROMPT_EVENT, onPrompt);
  window.addEventListener(MOCKUP_ASSISTANT_RUN_QUERY_EVENT, onQuery);
});

afterEach(() => {
  window.removeEventListener(MOCKUP_ASSISTANT_PROMPT_EVENT, onPrompt);
  window.removeEventListener(MOCKUP_ASSISTANT_RUN_QUERY_EVENT, onQuery);
  viewer?.unmount();
  viewer = undefined;
  vi.unstubAllGlobals();
});

describe("following the assistant's runs", () => {
  it("asks for the runs going on once, and reads a build the answer reports (fails when the viewer never asks)", async () => {
    ongoing = [{ mockup: "demo", source: "build", running: true }];
    const shown = await mount();

    expect(queries).toBe(1);
    expect(text(shown, "[data-dms-mockup-build]")).toBe(
      "dms.mockup.build_running",
    );
  });

  it("reads Building… while this mockup builds and Build it once the run ends, a run of another mockup changing nothing (fails when the label ignores the runs)", async () => {
    const shown = await mount();
    expect(text(shown, "[data-dms-mockup-build]")).toBe("dms.mockup.build");

    run({ mockup: "other", source: "build", running: true });
    await flush();
    expect(text(shown, "[data-dms-mockup-build]")).toBe("dms.mockup.build");

    run({ mockup: "demo", source: "build", running: true });
    await flush();
    expect(text(shown, "[data-dms-mockup-build]")).toBe(
      "dms.mockup.build_running",
    );

    run({ mockup: "demo", source: "build", running: false });
    await flush();
    expect(text(shown, "[data-dms-mockup-build]")).toBe("dms.mockup.build");
  });

  it("reads Resolving… while the comments are resolved, and a click still hands the request to the assistant (fails when the click changes or the label ignores the run)", async () => {
    const shown = await mount();
    run({ mockup: "demo", source: "resolve-comments", running: true });
    await flush();
    expect(text(shown, "[data-dms-mockup-resolve]")).toBe(
      "dms.mockup.resolve_running",
    );
    expect(text(shown, "[data-dms-mockup-build]")).toBe("dms.mockup.build");

    shown.host.querySelector<HTMLElement>("[data-dms-mockup-resolve]")?.click();
    await flush();
    expect(prompts).toEqual([
      { prompt: "demo", source: "resolve-comments", page: "orders" },
    ]);
  });

  it("ignores a run whose detail is not one (fails when a malformed event flips a label)", async () => {
    const shown = await mount();
    window.dispatchEvent(
      new CustomEvent(MOCKUP_ASSISTANT_RUN_EVENT, {
        detail: { mockup: "demo", source: "deploy", running: true },
      }),
    );
    window.dispatchEvent(
      new CustomEvent(MOCKUP_ASSISTANT_RUN_EVENT, {
        detail: { mockup: "demo", source: "build", running: "yes" },
      }),
    );
    await flush();
    expect(text(shown, "[data-dms-mockup-build]")).toBe("dms.mockup.build");
  });
});
