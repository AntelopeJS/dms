// @vitest-environment jsdom
import type { CommandPaletteGroup } from "@nuxt/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  watch,
  type App,
  type FunctionalComponent,
  type PropType,
  type Ref,
} from "vue";
import DashboardSearch from "../layers/dms-layout/app/components/layout/DashboardSearch.vue";
import { PaletteStub } from "./fixtures/dashboard-search-stub";
import {
  registerCommandPaletteAssistant,
  unregisterCommandPaletteAssistant,
  useCommandPaletteAssistant,
  type CommandPaletteAssistant,
} from "../layers/dms-layout/app/composables/useCommandPaletteAssistant";

const SOURCE_GROUPS: CommandPaletteGroup[] = [
  {
    id: "navigation",
    label: "Navigation",
    items: [{ label: "Orders" }, { label: "Order statuses" }],
  },
];

const ANSWER_COMPONENT = "EchoAnswer";
const ASSISTANT: CommandPaletteAssistant = {
  id: "demo:assistant",
  label: "$demo.assistant",
  icon: "i-sparkle",
  placeholder: "Ask the demo",
  suggestions: () => [
    { label: "Which customers churned?" },
    { label: "Late orders", prompt: "Which orders are late?" },
  ],
  answerComponent: ANSWER_COMPONENT,
};

let state: Map<string, Ref<unknown>>;
let app: App | undefined;
let host: HTMLDivElement;
let releaseAnswer: () => void;
let answerOutcome: Promise<void>;

/** Stands in for an answer component with an async setup. */
const EchoAnswer = defineComponent({
  props: {
    prompt: { type: String, required: true },
    close: { type: Function as PropType<() => void>, required: true },
  },
  async setup(props) {
    await answerOutcome;
    return () =>
      h("p", { "data-testid": "answer", onClick: props.close }, props.prompt);
  },
});

function deferAnswer(): void {
  answerOutcome = new Promise((resolve) => {
    releaseAnswer = resolve;
  });
}

function translate(key: string, params?: Record<string, unknown>): string {
  return params ? `${key}:${Object.values(params).join(",")}` : key;
}

function installRuntime(): void {
  state = new Map();
  Object.entries({ computed, ref, watch }).forEach(([key, value]) =>
    vi.stubGlobal(key, value),
  );
  vi.stubGlobal("useDmsState", (key: string, initial: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(initial()));
    return state.get(key);
  });
  vi.stubGlobal("useI18n", () => ({ t: translate }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) =>
      value.startsWith("$") ? `t(${value.slice(1)})` : value,
  }));
  vi.stubGlobal("useDmsAppConfig", () => ({
    ui: { icons: { close: "i-close", search: "i-search" } },
  }));
  vi.stubGlobal("useCommandPaletteGroups", () => ({
    groups: ref(SOURCE_GROUPS),
  }));
  vi.stubGlobal("COMMAND_PALETTE_FUSE_OPTIONS", {});
  vi.stubGlobal("useCommandPaletteAssistant", useCommandPaletteAssistant);
  vi.stubGlobal("resolveDmsComponent", (name: string) =>
    name === ANSWER_COMPONENT ? EchoAnswer : undefined,
  );
}

interface KbdStubProps {
  value: string;
}

const ButtonStub: FunctionalComponent = (_, { slots }) =>
  h("button", { "data-stub": "button" }, slots.default?.());
const KbdStub: FunctionalComponent<KbdStubProps> = (props) =>
  h("kbd", props.value);
const IconStub: FunctionalComponent = () => h("i");
const SkeletonStub: FunctionalComponent = () =>
  h("div", { "data-skeleton": "" });

function mountPalette(): void {
  app = createApp(DashboardSearch);
  app.component("UDashboardSearch", PaletteStub);
  app.component("UButton", ButtonStub);
  app.component("UKbd", KbdStub);
  app.component("UIcon", IconStub);
  app.component("USkeleton", SkeletonStub);
  app.mount(host);
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await nextTick();
}

function dialog(): HTMLElement {
  return host.querySelector<HTMLElement>('[role="dialog"]')!;
}

function input(): HTMLInputElement {
  return host.querySelector("input")!;
}

async function type(value: string): Promise<void> {
  input().value = value;
  input().dispatchEvent(new Event("input"));
  await nextTick();
}

function pressTab(shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    cancelable: true,
    bubbles: true,
  });
  input().dispatchEvent(event);
  return event;
}

function items(groupId: string): string[] {
  return [...host.querySelectorAll(`[data-group="${groupId}"]`)].map(
    (item) => item.textContent ?? "",
  );
}

function clickItem(groupId: string, index = 0): void {
  const matches = host.querySelectorAll<HTMLElement>(
    `[data-group="${groupId}"]`,
  );
  matches.item(index).click();
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  installRuntime();
  deferAnswer();
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("command palette assistant registry", () => {
  it("offers no assistant until one is registered", () => {
    expect(useCommandPaletteAssistant().assistant.value).toBeUndefined();
  });

  it("replaces an entry registered under the same id", () => {
    registerCommandPaletteAssistant(ASSISTANT);
    registerCommandPaletteAssistant({ ...ASSISTANT, label: "Updated" });
    expect(useCommandPaletteAssistant().assistant.value?.label).toBe("Updated");
  });

  it("uses the assistant registered last, and falls back when it leaves", () => {
    const { assistant } = useCommandPaletteAssistant();
    registerCommandPaletteAssistant(ASSISTANT);
    registerCommandPaletteAssistant({ ...ASSISTANT, id: "other" });
    expect(assistant.value?.id).toBe("other");
    unregisterCommandPaletteAssistant("other");
    expect(assistant.value?.id).toBe(ASSISTANT.id);
  });

  it("ignores an entry whose suggestions were stripped by the SSR payload", () => {
    registerCommandPaletteAssistant({
      ...ASSISTANT,
      suggestions:
        undefined as unknown as CommandPaletteAssistant["suggestions"],
    });
    expect(useCommandPaletteAssistant().assistant.value).toBeUndefined();
  });
});

describe("command palette without an assistant", () => {
  it("leaves the palette and the Tab key alone", async () => {
    mountPalette();
    await type("ord");
    const event = pressTab();
    expect(event.defaultPrevented).toBe(false);
    expect(items("dms-assistant-ask")).toEqual([]);
    expect(host.querySelector('[data-slot="assistantToggle"]')).toBeNull();
  });
});

describe("command palette assistant mode", () => {
  beforeEach(() => {
    registerCommandPaletteAssistant(ASSISTANT);
    mountPalette();
  });

  it("toggles between search and assistant mode with Tab", async () => {
    const event = pressTab();
    await nextTick();
    expect(event.defaultPrevented).toBe(true);
    expect(input().placeholder).toBe("Ask the demo");
    expect(input().dataset.icon).toBe("i-sparkle");
    expect(dialog().dataset.colorMode).toBe("false");
    expect(items("dms-assistant-suggestions")).toEqual([
      "Which customers churned?",
      "Late orders",
    ]);
    expect(host.textContent).toContain(
      "commandPalette.assistant.modeAssistant",
    );

    pressTab();
    await nextTick();
    expect(input().placeholder).toBe("");
    expect(items("navigation")).toEqual(["Orders", "Order statuses"]);
  });

  it("lets Shift+Tab move focus as usual", () => {
    expect(pressTab(true).defaultPrevented).toBe(false);
  });

  it("ends a non-empty search with an Ask the assistant item", async () => {
    await type("ord");
    expect(items("navigation")).toEqual(["Orders", "Order statuses"]);
    expect(items("dms-assistant-ask")).toEqual([
      "commandPalette.assistant.ask:ord",
    ]);
  });

  it("adds no Ask item while the search is empty", async () => {
    await type("  ");
    expect(items("dms-assistant-ask")).toEqual([]);
  });

  it("leaves the Ask item alone when nothing matches", async () => {
    await type("invoicez");
    expect(items("navigation")).toEqual([]);
    expect(items("dms-assistant-ask")).toEqual([
      "commandPalette.assistant.ask:invoicez",
    ]);
  });

  it("keeps Nuxt UI's empty state in search mode", async () => {
    expect(dialog().dataset.emptySlot).toBe("false");
    pressTab();
    await nextTick();
    expect(dialog().dataset.emptySlot).toBe("true");
  });

  it("answers the asked query through the module's component", async () => {
    await type("ord");
    clickItem("dms-assistant-ask");
    await nextTick();
    expect(input().value).toBe("ord");
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="answer"]')).toBeNull();

    releaseAnswer();
    await settle();
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.querySelector('[data-testid="answer"]')?.textContent).toBe(
      "ord",
    );
  });

  it("submits a suggestion's prompt and lets the answer close the palette", async () => {
    pressTab();
    await nextTick();
    clickItem("dms-assistant-suggestions", 1);
    releaseAnswer();
    await settle();
    const answer = host.querySelector<HTMLElement>('[data-testid="answer"]');
    expect(answer?.textContent).toBe("Which orders are late?");

    answer!.click();
    await nextTick();
    expect(dialog().dataset.open).toBe("false");
  });

  it("sends a typed prompt from the first item and keeps the suggestions", async () => {
    pressTab();
    await type("Why is order 10482 pending?");
    expect(items("dms-assistant-prompt")).toEqual([
      "commandPalette.assistant.send:Why is order 10482 pending?",
    ]);
    expect(items("dms-assistant-suggestions")).toHaveLength(2);
  });

  it("drops the answer once the prompt is edited", async () => {
    await type("ord");
    clickItem("dms-assistant-ask");
    releaseAnswer();
    await settle();
    await type("orders");
    expect(host.querySelector('[data-testid="answer"]')).toBeNull();
    expect(items("dms-assistant-prompt")).toEqual([
      "commandPalette.assistant.send:orders",
    ]);
  });

  it("states the failure when the answer cannot be computed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    answerOutcome = Promise.reject(new Error("offline"));
    await type("ord");
    clickItem("dms-assistant-ask");
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "commandPalette.assistant.failed",
    );
  });
});
