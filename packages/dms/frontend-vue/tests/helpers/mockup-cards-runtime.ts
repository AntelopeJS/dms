import "./table-runtime";
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  type App,
  type FunctionalComponent,
} from "vue";
import { createI18n } from "vue-i18n";
import { afterEach, beforeEach, vi } from "vitest";
import core from "../../layers/dms-core/app/entries/i18n/locales/core-en-GB.json";
import ui from "../../layers/dms-ui/app/entries/i18n/locales/ui-en-GB.json";
import { stubObservers } from "./fake-observers";

const { default: MockupCards } = await import(
  "../../layers/dms-ui/app/entries/mockups/MockupCards"
);

export const en = { ...core, ...ui, dms: { ...core.dms, ...ui.dms } };

const i18n = createI18n({
  legacy: false,
  locale: "en",
  messages: { en },
});

export const NOW = new Date("2026-11-13T12:30:00.000Z");
export const UPDATED = "2026-11-13T10:00:00.000Z";

export const built = {
  name: "bike-rental",
  title: "Bike rental",
  pages: 2,
  openComments: 0,
  source: "claude-code",
  updatedAt: UPDATED,
  status: "built",
  builtAt: UPDATED,
  builtPages: [
    { path: "/bikes", title: "Bikes", changed: false },
    { path: "/bikes/new", title: "/bikes/new", changed: false },
  ],
};

export const partial = {
  ...built,
  name: "bike-partial",
  title: "Bike partial",
  pages: 5,
};

export const draft = {
  name: "stations-map",
  pages: 1,
  openComments: 2,
  source: "chat",
  updatedAt: UPDATED,
  status: "draft",
};

export const bare = {
  name: "staff-planning",
  title: "Staff planning",
  pages: 2,
  openComments: 0,
  updatedAt: UPDATED,
  status: "draft",
};

const DmsLink = defineComponent({
  props: { to: String },
  setup:
    (props, { slots, attrs }) =>
    () =>
      h("a", { ...attrs, href: props.to }, slots.default?.()),
});

const UBadge = defineComponent({
  props: { color: String },
  setup:
    (props, { slots, attrs }) =>
    () =>
      h("span", { ...attrs, "data-color": props.color }, slots.default?.()),
});

/** Draws what `UDropdownMenu` would, flat: every item of every group a button. */
const UDropdownMenu: FunctionalComponent<{ items?: MenuItem[][] }> = (
  props,
  { slots },
) =>
  h("div", [
    slots.default?.(),
    h(
      "ul",
      (props.items ?? []).flat().map((item) =>
        h("li", [
          h(
            "button",
            {
              type: "button",
              "data-menu-item": item.label,
              onClick: item.onSelect,
            },
            item.label,
          ),
        ]),
      ),
    ),
  ]);

/** Draws a modal's body and footer while it is open. */
const UModal = defineComponent({
  props: { open: Boolean, title: String },
  setup:
    (props, { slots }) =>
    () =>
      props.open
        ? h("div", { "data-modal": props.title }, [
            slots.body?.(),
            slots.footer?.(),
          ])
        : null,
});

const UButton = defineComponent({
  props: { disabled: Boolean },
  setup:
    (props, { slots, attrs }) =>
    () =>
      h(
        "button",
        { type: "button", ...attrs, disabled: props.disabled },
        slots.default?.(),
      ),
});

const UInput = defineComponent({
  props: { modelValue: String },
  emits: ["update:modelValue"],
  setup:
    (props, { emit, attrs }) =>
    () =>
      h("input", {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) => {
          if (event.target instanceof HTMLInputElement) {
            emit("update:modelValue", event.target.value);
          }
        },
      }),
});

const UFormField = defineComponent({
  props: { error: [String, Boolean] },
  setup:
    (props, { slots }) =>
    () =>
      h("div", [slots.default?.(), props.error ? h("p", props.error) : null]),
});

interface MenuItem {
  label: string;
  onSelect: () => void;
}

let app: App | undefined;
let host: HTMLElement;

interface Reply {
  name?: string;
  pages?: unknown[];
  url?: string;
  stale?: boolean;
  digest?: string;
}

export const authFetch =
  vi.fn<(url: string, options?: { body?: unknown }) => Promise<Reply>>();
export const navigateTo = vi.fn();
export const refresh = vi.fn();
export const addToast = vi.fn();
export const presentError = vi.fn();

/** What the confirm modal does once the user confirms: awaits `onConfirm`. */
async function acceptingConfirm(options: {
  onConfirm?: () => Promise<void>;
}): Promise<boolean> {
  await options.onConfirm?.();
  return true;
}
export const confirm = vi.fn(acceptingConfirm);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  stubObservers();
  refresh.mockReset();
  addToast.mockReset();
  presentError.mockReset();
  confirm.mockReset();
  vi.stubGlobal("useConfirm", () => ({ confirm }));
  vi.stubGlobal("useToast", () => ({ add: addToast }));
  authFetch.mockReset();
  authFetch.mockResolvedValue({ pages: [] });
  vi.stubGlobal("useI18n", () => i18n.global);
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useApiErrorPresenter", () => ({ presentError }));
  navigateTo.mockReset();
  vi.stubGlobal("useDmsRouter", () => ({ push: navigateTo }));
});

afterEach(() => {
  app?.unmount();
  host.remove();
  app = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

export async function mountCards(
  items: unknown[],
  context: { firstPageLoading?: boolean } = {},
): Promise<HTMLElement> {
  host = document.createElement("div");
  document.body.append(host);
  app = createApp(MockupCards, {
    context: { items, firstPageLoading: false, refresh, ...context },
  });
  app.component("DmsLink", DmsLink);
  app.component("UBadge", UBadge);
  app.component("UButton", UButton);
  app.component("UDropdownMenu", UDropdownMenu);
  app.component("UModal", UModal);
  app.component("UInput", UInput);
  app.component("UFormField", UFormField);
  app.component("USkeleton", defineComponent({ setup: () => () => h("i") }));
  app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
  app.mount(host);
  await nextTick();
  return host;
}

export const card = (root: HTMLElement, name: string) => {
  const found = root.querySelector(`[data-dms-mockup-card="${name}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`no card for ${name}`);
  return found;
};

export const text = (root: ParentNode, selector: string) =>
  root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();

export const menuItem = (root: ParentNode, label: string): HTMLElement => {
  const found = root.querySelector(`[data-menu-item="${label}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`no item ${label}`);
  return found;
};

export const click = async (element: Element) => {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextTick();
};

/** Takes the mounted cards off the page, as a test that mounts a second state does. */
export function unmountCards(): void {
  app?.unmount();
  host.remove();
  app = undefined;
}
