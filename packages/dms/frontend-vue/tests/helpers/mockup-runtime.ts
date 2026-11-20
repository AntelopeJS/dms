import {
  computed,
  createApp,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  reactive,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
  type App,
  type FunctionalComponent,
  type ShallowRef,
  type VNode,
} from "vue";
import { vi } from "vitest";
import type { JsonValue } from "../../layers/dms-core/app/types/json";
import type { Toast } from "@nuxt/ui/composables/useToast";
import type {
  ApiErrorPresenter,
  PresentApiErrorOptions,
} from "../../layers/dms-core/app/composables/useApiErrorPresenter";
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
import { FakeLocks, type LockRequest } from "./mockup-locks-backend";
import {
  annotation,
  answerAnnotations,
  type FakeRequest,
} from "./mockup-notes-backend";

export { annotation };

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

export const UButton: FunctionalComponent = (_props, { slots, attrs }) =>
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

/** Stands in for Nuxt UI's input: one with `autofocus` takes the focus once drawn, as the real one does. */
export const UInput: FunctionalComponent<
  { modelValue?: string },
  ["update:modelValue"]
> = (props, { emit, attrs }) =>
  h("input", {
    ...attrs,
    value: props.modelValue,
    onVnodeMounted: (vnode: VNode) => {
      if (attrs.autofocus !== undefined && vnode.el instanceof HTMLElement) {
        vnode.el.focus();
      }
    },
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

/** Stands in for Nuxt UI's tooltip: it draws its trigger and records the text and the key badges it would show. */
const UTooltip: FunctionalComponent<{ text?: string; kbds?: string[] }> = (
  props,
  { slots },
) =>
  h(
    "span",
    {
      "data-tooltip": props.text ?? "",
      "data-tooltip-kbds": JSON.stringify(props.kbds ?? []),
    },
    slots.default?.(),
  );
UTooltip.props = ["text", "kbds"];

/**
 * Stands in for Nuxt UI's dropdown menu: it draws its trigger and each item as
 * a button. An item picked runs its action, then closes the menu as Reka does:
 * the content's `onCloseAutoFocus` may keep the focus where it is, else the
 * trigger takes it back.
 */
export const UDropdownMenu: FunctionalComponent<{
  items?: Array<{ label?: string; onSelect?: () => void }>;
  content?: { onCloseAutoFocus?: (event: Event) => void };
}> = (props, { slots }) =>
  h("div", [
    slots.default?.(),
    ...(props.items ?? []).map((item) =>
      h(
        "button",
        {
          type: "button",
          "data-menu-item": item.label,
          onClick: async (event: Event) => {
            const trigger =
              event.currentTarget instanceof Element
                ? event.currentTarget.parentElement?.firstElementChild
                : undefined;
            item.onSelect?.();
            await nextTick();
            const close = new Event("closeAutoFocus", { cancelable: true });
            props.content?.onCloseAutoFocus?.(close);
            if (!close.defaultPrevented && trigger instanceof HTMLElement) {
              trigger.focus();
            }
          },
        },
        item.label,
      ),
    ),
  ]);
UDropdownMenu.props = ["items", "content"];

/** Stands in for Nuxt UI's key badge. */
const UKbd: FunctionalComponent<{ value?: string }> = (props) =>
  h("kbd", props.value);
UKbd.props = ["value"];

export const UIcon: FunctionalComponent = (_props, { attrs }) =>
  h("span", attrs);

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

/** One ref per key, made with `init` on first use and shared by every later caller, as the DMS state and cookies are. */
function sharedRefs(): (
  key: string,
  init: () => JsonValue,
) => ShallowRef<JsonValue> {
  const refs = new Map<string, ShallowRef<JsonValue>>();
  return (key, init) => {
    const found = refs.get(key);
    if (found) return found;
    const made = shallowRef<JsonValue>(init());
    refs.set(key, made);
    return made;
  };
}

interface RuntimeOptions {
  /** The viewer's URL query: by default the first page of {@link mockupSpec} open, not the Overview. */
  query?: Record<string, string>;
  mockups?: Array<{ name: string; title?: string; pages: number }>;
  spec?: MockupSpecDocument;
  blocks?: MockupBlockType[];
  /** The notes the fake backend starts with. */
  notes?: MockupAnnotation[];
}

/** What the viewer raised: a toast it added, or a failure it presented. */
type RaisedToast = Toast | (PresentApiErrorOptions & Pick<Toast, "color">);

export interface MockupRuntime {
  authFetch: ReturnType<typeof vi.fn>;
  /** The notes the fake backend holds. */
  notes: MockupAnnotation[];
  /** `spec.json` as the fake backend holds it, its digest, and the viewer of an editor that wrote this very file. */
  file: {
    spec: MockupSpecDocument;
    version: number;
    writtenBy?: { name: string };
  };
  /** The lock requests the viewer sent: taking (`PUT` with a `path`), renewing (`PUT` without) and freeing (`DELETE`) the lock on a block. */
  locks: LockRequest[];
  /** The id of the block the fake backend holds for each viewer; deleting an entry makes the lock run out. */
  holding: FakeLocks["holding"];
  /** The ids of the blocks other viewers hold: taking one answers 409. */
  rivals: FakeLocks["rivals"];
  /** Holds the answer of every lock request sent from now on; the returned function lets them answer. */
  holdLocks: () => () => void;
  /** The toasts the viewer raised. */
  toasts: RaisedToast[];
  /** The viewer's route, which the router's pushes move, as Inertia moves the page's URL. */
  route: { path: string; query: Record<string, string> };
  /** The queries the viewer pushed, oldest first: each one an entry of the browser's history. */
  pushes: Record<string, string>[];
}

const SPEC_URL = "/api/mockup/demo/spec";
const LOCKS_URL = "/api/mockup/demo/locks";
const CATALOG_URL = "/api/mockup/schema/blocks";

/** Stubs what the viewer reads from the dashboard and the browser. */
export function stubMockupRuntime(options: RuntimeOptions = {}): MockupRuntime {
  FakeEventSource.instances = [];
  const notes: MockupAnnotation[] = [...(options.notes ?? [])];
  const toasts: RaisedToast[] = [];
  const file: MockupRuntime["file"] = {
    spec: options.spec ?? mockupSpec(),
    version: 1,
  };
  const lockTable = new FakeLocks();
  const authFetch = vi.fn(async (url: string, init?: FakeRequest) => {
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
      if (
        init.body.digest !== undefined &&
        init.body.digest !== `d${file.version}`
      ) {
        throw Object.assign(new Error("conflict"), { status: 409 });
      }
      file.spec = structuredClone(init.body.spec);
      file.version += 1;
      file.writtenBy = undefined;
      return { ok: true, digest: `d${file.version}` };
    }
    if (url === SPEC_URL) {
      return {
        spec: structuredClone(file.spec),
        digest: `d${file.version}`,
        writtenBy: file.writtenBy,
      };
    }
    if (url.startsWith(LOCKS_URL))
      return lockTable.answer(url, init, file.spec);
    return answerAnnotations(notes, url, init);
  });
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
    te: () => false,
  }));
  const route = reactive({
    path: "/mockup",
    query: options.query ?? { name: "demo", page: "orders" },
  });
  const pushes: Record<string, string>[] = [];
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useDmsRouter", () => ({
    push: async (to: { query?: Record<string, string> }) => {
      if (!to.query) return;
      pushes.push(to.query);
      route.query = to.query;
    },
  }));
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { baseURL: "http://backend/" } },
  }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  const presentError: ApiErrorPresenter["presentError"] = (_error, init) =>
    toasts.push({ color: "error", ...init });
  vi.stubGlobal("useApiErrorPresenter", () => ({ presentError }));
  vi.stubGlobal("useToast", () => ({
    add: (toast: Toast) => toasts.push(toast),
  }));
  const shared = sharedRefs();
  vi.stubGlobal("useDmsState", (key: string, init: () => JsonValue) =>
    shared(`state:${key}`, init),
  );
  vi.stubGlobal(
    "useDmsCookie",
    (key: string, options?: { default?: () => JsonValue }) =>
      shared(`cookie:${key}`, options?.default ?? (() => null)),
  );
  vi.stubGlobal("useDmsUserSession", () => ({ loggedIn: ref(true) }));
  vi.stubGlobal("isDmsHydrating", () => false);
  return {
    authFetch,
    notes,
    file,
    locks: lockTable.requests,
    holding: lockTable.holding,
    rivals: lockTable.rivals,
    holdLocks: () => lockTable.hold(),
    toasts,
    route,
    pushes,
  };
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
    type: "state" | "annotations" | "presence",
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
  app.component("UTooltip", UTooltip);
  app.component("UKbd", UKbd);
  app.component("UDropdownMenu", UDropdownMenu);
  app.mount(host);
  await flush();
  const posted: PreviewInboundMessage[] = [];
  const spied = new WeakSet<Window>();
  /** The preview's current window, its posts recorded: switching Real data replaces the frame. */
  const frameWindow = (): Window => {
    const current = host.querySelector("iframe")?.contentWindow;
    if (!current) throw new Error("The viewer drew no preview");
    if (!spied.has(current)) {
      spied.add(current);
      vi.spyOn(current, "postMessage").mockImplementation((message) => {
        const parsed = parsePreviewMessage(message);
        if (parsed) posted.push(parsed);
      });
    }
    return current;
  };
  const iframe = host.querySelector("iframe");
  if (!iframe) throw new Error("The viewer drew no preview");
  frameWindow();
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
          source: frameWindow(),
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
