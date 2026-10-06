// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type App,
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
} from "vue";
import { defineShortcuts } from "@nuxt/ui/runtime/composables/defineShortcuts.js";

const Input = defineComponent({
  inheritAttrs: false,
  props: { modelValue: String, icon: String },
  setup(props, { attrs, slots, expose }) {
    const inputRef = ref<HTMLInputElement>();
    expose({ inputRef });
    return () =>
      h("div", [
        h("input", { ...attrs, ref: inputRef, "data-icon": props.icon }),
        slots.trailing?.(),
      ]);
  },
});

const Kbd = defineComponent({
  props: { value: String },
  setup: (props) => () => h("kbd", props.value),
});

let app: App | undefined;
let host: HTMLDivElement;

async function mount(props: Record<string, unknown> = {}) {
  const { default: SearchInput } = await import(
    "../layers/dms-ui/app/build/components/form/SearchInput.vue"
  );
  app = createApp({
    setup: () => () => h(SearchInput, { placeholder: "Search", ...props }),
  });
  app.component("UInput", Input);
  app.component("UKbd", Kbd);
  app.mount(host);
  await nextTick();
}

const input = () => host.querySelector("input")!;
const hints = () =>
  [...host.querySelectorAll("kbd")].map((kbd) => kbd.textContent);

beforeEach(() => {
  vi.stubGlobal("defineShortcuts", defineShortcuts);
  vi.stubGlobal("useDmsCookie", () => ref("other"));
  vi.stubGlobal("computed", computed);
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("is named by its placeholder, with the magnifier and no key of its own", async () => {
  await mount();
  expect(input().getAttribute("aria-label")).toBe("Search");
  expect(input().dataset.icon).toBe("i-ph-magnifying-glass");
  expect(input().getAttribute("aria-keyshortcuts")).toBeNull();
  expect(hints()).toEqual([]);
});

it('takes "/" as the navigation search, and says so', async () => {
  await mount({ shortcut: "nav" });
  expect(hints()).toEqual(["/"]);
  expect(input().getAttribute("aria-keyshortcuts")).toBe("/");

  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { key: "/", bubbles: true }),
  );
  expect(document.activeElement).toBe(input());
});

it("draws a page search's keys for the platform the page picked", async () => {
  await mount({ shortcut: "page", hintPlatform: "mac" });
  expect(hints()).toEqual(["⌘", "/"]);
  expect(input().getAttribute("aria-keyshortcuts")).toBe("Control+/");
});
