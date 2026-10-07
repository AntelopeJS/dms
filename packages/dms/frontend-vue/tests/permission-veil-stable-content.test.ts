// @vitest-environment jsdom
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  shallowRef,
  Suspense,
  type App,
  type Component,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PermissionVeil from "../layers/dms-ui/app/build/components/permission/PermissionVeil.vue";

// A role preview veils the blocks of the page it previews, and the veils move
// as the preview answers for each page. A block's content (a table view) has
// an async setup: remounting it while the page's Suspense waits for the next
// page left Vue mounting it under a detached placeholder ("can't access
// property insertBefore, parent is null"). The veil must keep its content in
// place whatever its state.

type VeilState = "hidden" | "readonly" | "limited" | null;

let app: App | undefined;
let host: HTMLDivElement;
const errors: unknown[] = [];
const onRejection = (event: PromiseRejectionEvent) => {
  errors.push(event.reason);
  event.preventDefault();
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const Stub = defineComponent({
  setup(_, { slots }) {
    return () => h("span", slots.default?.());
  },
});

function asyncBlock(setups: { count: number }, wait: () => Promise<void>) {
  return defineComponent({
    name: "AsyncBlock",
    async setup() {
      setups.count++;
      await wait();
      return () => h("section", { class: "block" }, "rows");
    },
  });
}

function mount(root: Component) {
  app = createApp(root);
  app.component("UTooltip", Stub);
  app.component("UIcon", Stub);
  app.config.errorHandler = (error) => {
    errors.push(error);
  };
  app.mount(host);
}

async function flush() {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
    await nextTick();
  }
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  errors.length = 0;
  window.addEventListener("unhandledrejection", onRejection);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  window.removeEventListener("unhandledrejection", onRejection);
});

it("keeps a persistent veil's content mounted when its state changes", async () => {
  const setups = { count: 0 };
  const Block = asyncBlock(setups, () => Promise.resolve());
  const state = ref<VeilState>(null);
  mount({
    render: () =>
      h(Suspense, null, {
        default: () =>
          h(
            PermissionVeil,
            { state: state.value, label: "Limited", persistent: true },
            { default: () => h(Block) },
          ),
      }),
  });
  await vi.waitFor(() => expect(host.querySelector(".block")).not.toBeNull());
  const block = host.querySelector(".block");

  for (const next of ["limited", null, "hidden", "readonly", null] as const) {
    state.value = next;
    await flush();
    expect(host.querySelector(".block")).toBe(block);
  }
  expect(setups.count).toBe(1);
  expect(host.querySelector("[data-permission-veil]")).toBeNull();
  state.value = "hidden";
  await flush();
  expect(
    host
      .querySelector("[data-permission-veil]")
      ?.getAttribute("data-permission-veil"),
  ).toBe("hidden");
  expect(errors).toEqual([]);
});

it("renders the slot alone when it is not persistent and has no state", async () => {
  mount({
    render: () =>
      h(PermissionVeil, { state: null }, { default: () => h("p", "plain") }),
  });
  await flush();
  expect(host.innerHTML).toBe("<p>plain</p>");
});

it("survives veil changes on the old page while the next page loads", async () => {
  const setups = { count: 0 };
  const pending: Array<ReturnType<typeof deferred>> = [];
  const Block = asyncBlock(setups, () => {
    // The first mount resolves at once; later ones wait for the test.
    if (setups.count === 1) return Promise.resolve();
    const next = deferred();
    pending.push(next);
    return next.promise;
  });
  const nextPage = deferred();
  const NextPage = defineComponent({
    async setup() {
      await nextPage.promise;
      return () => h("main", { class: "next" }, "next page");
    },
  });
  const state = ref<VeilState>("limited");
  const OldPage = defineComponent({
    setup() {
      return () =>
        h(
          "main",
          h(
            PermissionVeil,
            { state: state.value, label: "Limited", persistent: true },
            { default: () => h(Block) },
          ),
        );
    },
  });
  const page = shallowRef<Component>(OldPage);
  const pageKey = ref("old");
  mount({
    render: () =>
      h(Suspense, null, {
        default: () => h(page.value, { key: pageKey.value }),
      }),
  });
  await vi.waitFor(() => expect(host.querySelector(".block")).not.toBeNull());

  // Navigation: the Suspense keeps the old page while the next one loads, and
  // the preview's answer for the next page moves the old page's veils.
  page.value = NextPage;
  pageKey.value = "next";
  await flush();
  state.value = null;
  await flush();
  state.value = "limited";
  await flush();
  for (const entry of pending) entry.resolve();
  await flush();
  nextPage.resolve();
  await vi.waitFor(() => expect(host.querySelector(".next")).not.toBeNull());
  await flush();

  expect(setups.count).toBe(1);
  expect(errors).toEqual([]);
});
