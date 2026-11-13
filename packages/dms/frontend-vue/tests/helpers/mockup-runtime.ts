import {
  computed,
  createApp,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
  type App,
  type FunctionalComponent,
} from "vue";
import { vi } from "vitest";
import {
  parsePreviewMessage,
  PREVIEW_CHANNEL,
  type PreviewInboundMessage,
  type PreviewOutboundMessage,
  type PreviewRenderMessage,
} from "../../layers/dms-ui/app/entries/utils/blockPreview";
import type {
  MockupAnnotation,
  MockupPageState,
  MockupState,
} from "../../layers/dms-ui/app/entries/utils/mockup";

export class FakeEventSource {
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 1;
  private readonly listeners = new Map<string, Array<(event: Event) => void>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  emit(type: string, data: Parameters<typeof JSON.stringify>[0]): void {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const UButton: FunctionalComponent = (_props, { slots, attrs }) =>
  h("button", { type: "button", ...attrs }, slots.default?.());

const UBadge: FunctionalComponent = (_props, { slots, attrs }) =>
  h("span", attrs, slots.default?.());

const UAlert: FunctionalComponent<{ title?: string }> = (props) =>
  h("div", { role: "alert" }, props.title);
UAlert.props = ["title"];

const UTextarea: FunctionalComponent<
  { modelValue?: string },
  ["update:modelValue"]
> = (props, { emit }) =>
  h("textarea", {
    value: props.modelValue,
    onInput: (event: Event) => {
      if (event.target instanceof HTMLTextAreaElement) {
        emit("update:modelValue", event.target.value);
      }
    },
  });
UTextarea.props = ["modelValue"];
UTextarea.emits = ["update:modelValue"];

export function mockupPage(
  overrides: Partial<MockupPageState> = {},
): MockupPageState {
  return {
    id: "orders",
    title: "Orders",
    options: { theme: "dark", locale: "fr-FR" },
    tree: [{ type: "KpiCard", options: { title: "Revenue" } }],
    paths: { "block-0": "/pages/0/tree/0" },
    ...overrides,
  };
}

export function mockupState(overrides: Partial<MockupState> = {}): MockupState {
  return {
    name: "demo",
    revision: 1,
    pages: [mockupPage()],
    issues: [],
    ...overrides,
  };
}

export function annotation(
  overrides: Partial<MockupAnnotation> = {},
): MockupAnnotation {
  return {
    id: "a1",
    page: "orders",
    path: "/pages/0/tree/0",
    text: "Tighten the spacing",
    status: "open",
    createdAt: "2026-11-07T10:00:00.000Z",
    ...overrides,
  };
}

interface RuntimeOptions {
  query?: Record<string, string>;
  mockups?: Array<{ name: string; title?: string; pages: number }>;
}

export interface MockupRuntime {
  authFetch: ReturnType<typeof vi.fn>;
  /** The notes the fake backend holds. */
  notes: MockupAnnotation[];
}

/** Stubs what the viewer reads from the dashboard and the browser. */
export function stubMockupRuntime(options: RuntimeOptions = {}): MockupRuntime {
  FakeEventSource.instances = [];
  const notes: MockupAnnotation[] = [];
  const authFetch = vi.fn(
    async (
      url: string,
      init?: { method?: string; body?: Record<string, string> },
    ) => {
      if (url === "/api/mockup") return { mockups: options.mockups ?? [] };
      if (init?.method === "POST") {
        const created = annotation({ ...init.body, id: "new" });
        notes.push(created);
        return created;
      }
      if (init?.method === "PATCH") {
        const id = decodeURIComponent(url.split("/").at(-1) ?? "");
        const found = notes.find((entry) => entry.id === id);
        return { ...found, ...init.body };
      }
      return { annotations: notes };
    },
  );
  for (const [name, value] of Object.entries({
    computed,
    onBeforeUnmount,
    onMounted,
    provide,
    ref,
    shallowRef,
    useTemplateRef,
    watch,
  })) {
    vi.stubGlobal(name, value);
  }
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, params?: Record<string, number>) =>
      params ? `${key} ${Object.values(params).join(",")}` : key,
  }));
  vi.stubGlobal("useDmsRoute", () => ({
    path: "/mockup",
    query: options.query ?? { name: "demo" },
  }));
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { baseURL: "http://backend/" } },
  }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  return { authFetch, notes };
}

type WithoutChannel<Message> = Message extends unknown
  ? Omit<Message, "channel">
  : never;

export interface MountedViewer {
  host: HTMLElement;
  stream: FakeEventSource;
  iframe: HTMLIFrameElement;
  /** The protocol messages the viewer posted to the preview window, oldest first. */
  posted: PreviewInboundMessage[];
  /** Has the preview say something, as its own window. */
  say: (message: WithoutChannel<PreviewOutboundMessage>) => Promise<void>;
  /** Has the backend send a stream event, and lets the viewer settle. */
  publish: (
    type: "state" | "annotations",
    data: Parameters<FakeEventSource["emit"]>[1],
  ) => Promise<void>;
  unmount: () => void;
}

export async function flush(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

/** Mounts `DmsMockupViewer` against the fake stream and a spied preview window. */
export async function mountViewer(): Promise<MountedViewer> {
  const { default: MockupViewer } = await import(
    "../../layers/dms-ui/app/components/block-preview/MockupViewer.vue"
  );
  const host = document.createElement("div");
  document.body.append(host);
  const app: App = createApp(MockupViewer);
  app.component("UButton", UButton);
  app.component("UBadge", UBadge);
  app.component("UAlert", UAlert);
  app.component("UTextarea", UTextarea);
  app.mount(host);
  await flush();
  const iframe = host.querySelector("iframe");
  const frameWindow = iframe?.contentWindow;
  if (!iframe || !frameWindow) throw new Error("The viewer drew no preview");
  const posted: PreviewInboundMessage[] = [];
  vi.spyOn(frameWindow, "postMessage").mockImplementation((message) => {
    const parsed = parsePreviewMessage(message);
    if (parsed) posted.push(parsed);
  });
  const stream = FakeEventSource.instances[0];
  return {
    host,
    stream,
    iframe,
    posted,
    publish: async (type, data) => {
      stream.emit(type, data);
      await flush();
    },
    say: async (message) => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { channel: PREVIEW_CHANNEL, ...message },
          source: frameWindow,
        }),
      );
      await flush();
    },
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

export function rendered(
  posted: PreviewInboundMessage[],
): PreviewRenderMessage[] {
  return posted.filter((message) => message.type === "render");
}
