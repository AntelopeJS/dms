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
import type { MockupBlockType } from "../../layers/dms-ui/app/entries/utils/mockupCatalog";
import type { MockupSpecDocument } from "../../layers/dms-ui/app/entries/utils/mockupSpec";

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

const UInput: FunctionalComponent<
  { modelValue?: string },
  ["update:modelValue"]
> = (props, { emit, attrs }) =>
  h("input", {
    ...attrs,
    value: props.modelValue,
    onInput: (event: Event) => {
      if (event.target instanceof HTMLInputElement) {
        emit("update:modelValue", event.target.value);
      }
    },
  });
UInput.props = ["modelValue"];
UInput.emits = ["update:modelValue"];

const USwitch: FunctionalComponent<
  { modelValue?: boolean },
  ["update:modelValue"]
> = (props, { emit, attrs }) =>
  h("button", {
    ...attrs,
    type: "button",
    role: "switch",
    "aria-checked": String(!!props.modelValue),
    onClick: () => emit("update:modelValue", !props.modelValue),
  });
USwitch.props = ["modelValue"];
USwitch.emits = ["update:modelValue"];

type SelectItem = { label: string; value: unknown };
const USelect: FunctionalComponent<
  { modelValue?: unknown; items?: SelectItem[] },
  ["update:modelValue"]
> = (props, { emit, attrs }) =>
  h(
    "select",
    {
      ...attrs,
      value: String(props.modelValue),
      onChange: (event: Event) => {
        if (!(event.target instanceof HTMLSelectElement)) return;
        const picked = (props.items ?? [])[event.target.selectedIndex];
        emit("update:modelValue", picked?.value);
      },
    },
    (props.items ?? []).map((item) =>
      h("option", { value: String(item.value) }, item.label),
    ),
  );
USelect.props = ["modelValue", "items"];
USelect.emits = ["update:modelValue"];

const UModal: FunctionalComponent<{ open?: boolean; title?: string }> = (
  props,
  { slots },
) =>
  props.open
    ? h("div", { role: "dialog", "aria-label": props.title }, [
        slots.body?.(),
        slots.footer?.(),
      ])
    : null;
UModal.props = ["open", "title"];

const UIcon: FunctionalComponent = () => h("span");

/** A spec whose one page draws the tree {@link mockupPage} compiles. */
export function mockupSpec(): MockupSpecDocument {
  return {
    version: 1,
    pages: [
      {
        id: "orders",
        title: "Orders",
        tree: [{ type: "KpiCard", options: { title: "Revenue" } }],
      },
    ],
  };
}

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
  spec?: MockupSpecDocument;
  blocks?: MockupBlockType[];
}

export interface MockupRuntime {
  authFetch: ReturnType<typeof vi.fn>;
  /** The notes the fake backend holds. */
  notes: MockupAnnotation[];
  /** `spec.json` as the fake backend holds it, and its digest. */
  file: { spec: MockupSpecDocument; version: number };
  /** The toasts the viewer raised. */
  toasts: Array<Record<string, unknown>>;
}

const SPEC_URL = "/api/mockup/demo/spec";
const CATALOG_URL = "/api/mockup/schema/blocks";

/** Stubs what the viewer reads from the dashboard and the browser. */
export function stubMockupRuntime(options: RuntimeOptions = {}): MockupRuntime {
  FakeEventSource.instances = [];
  const notes: MockupAnnotation[] = [];
  const toasts: Array<Record<string, unknown>> = [];
  const file = { spec: options.spec ?? mockupSpec(), version: 1 };
  const authFetch = vi.fn(
    async (
      url: string,
      init?: {
        method?: string;
        body?: Record<string, string> & { spec?: MockupSpecDocument };
      },
    ) => {
      if (url === "/api/mockup") {
        const results = (options.mockups ?? []).map((mockup) => ({
          ...mockup,
          openComments: 0,
          updatedAt: "2026-11-13T10:00:00.000Z",
          status: "draft",
        }));
        return { results, total: results.length };
      }
      if (url === CATALOG_URL) return { blocks: options.blocks ?? [] };
      if (url === SPEC_URL && init?.method === "PUT" && init.body?.spec) {
        file.spec = structuredClone(init.body.spec);
        file.version += 1;
        return { ok: true, digest: `d${file.version}` };
      }
      if (url === SPEC_URL) {
        return { spec: structuredClone(file.spec), digest: `d${file.version}` };
      }
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
  vi.stubGlobal("useApiErrorPresenter", () => ({
    presentError: (_error: unknown, init: Record<string, unknown>) =>
      toasts.push({ color: "error", ...init }),
  }));
  vi.stubGlobal("useToast", () => ({
    add: (toast: Record<string, unknown>) => toasts.push(toast),
  }));
  return { authFetch, notes, file, toasts };
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
  app.component("UInput", UInput);
  app.component("USwitch", USwitch);
  app.component("USelect", USelect);
  app.component("UModal", UModal);
  app.component("UIcon", UIcon);
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
