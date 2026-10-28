/** @vitest-environment jsdom */
/**
 * The module store listing through the runtime's real async data: read with
 * the page, so the Modules page and the store render their tiles with the
 * store's details on the server, and the browser neither reads it again on
 * hydration nor once mounted while nothing moves. A tile's skeleton is block
 * for block the size of the tile it stands for.
 */
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onMounted,
  ref,
  Suspense,
  createSSRApp,
  watch,
  type App,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  hydrate,
  mountInBrowser,
  serverRender,
  stubApiData,
} from "./helpers/api-data-runtime";
import { useModuleStore } from "../layers/dms-layout/app/composables/page/useModuleStore";
import ModuleTileSkeleton from "../layers/dms-layout/app/entries/components/pages/modules/ModuleTileSkeleton";

const idleListing = {
  enabled: true,
  busy: false,
  modules: [{ id: "orders", state: "installed", frontend: "synced" }],
};

const authFetch = vi.fn();
const isOwner = ref(true);
const mounted: App[] = [];

const Store = defineComponent({
  setup() {
    const store = useModuleStore();

    onMounted(() => store.start());
    return () =>
      h(
        "p",
        store.listing.value
          ? store.listing.value.modules.map((entry) => entry.id).join(",")
          : `loading:${Boolean(store.loadingError.value)}`,
      );
  },
});
const Page = defineComponent({
  setup: () => () =>
    h("main", [h(Suspense, null, { default: () => h(Store) })]),
});

async function settle(): Promise<void> {
  await nextTick();
  await new Promise((done) => setTimeout(done, 0));
}

beforeEach(() => {
  isOwner.value = true;
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useIsOwner", () => computed(() => isOwner.value));
  stubApiData(authFetch);
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("renders the store listing on the server, and the browser does not read it again", async () => {
  authFetch.mockResolvedValue(structuredClone(idleListing));
  vi.stubEnv("SSR", true);
  const { html, payload } = await serverRender(Page);
  vi.stubEnv("SSR", false);
  expect(html).toBe("<main><p>orders</p></main>");
  expect(authFetch).toHaveBeenCalledTimes(1);

  authFetch.mockClear();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { app, container } = hydrate(Page, html, payload);
  mounted.push(app);
  await settle();
  expect(authFetch).not.toHaveBeenCalled();
  expect(container.innerHTML).toBe(html);
  expect(warn).not.toHaveBeenCalled();
});

it("reads nothing for a member", async () => {
  isOwner.value = false;
  vi.stubEnv("SSR", true);
  const { html } = await serverRender(Page);
  expect(html).toBe("<main><p>loading:false</p></main>");
  expect(authFetch).not.toHaveBeenCalled();
});

it("reads the listing once on a client navigation, the setup awaiting nothing", async () => {
  authFetch.mockResolvedValue(structuredClone(idleListing));
  const { app, container } = mountInBrowser(Page);
  mounted.push(app);
  expect(container.innerHTML).toBe("<main><p>loading:false</p></main>");
  for (let tick = 0; tick < 4; tick++) await settle();
  expect(authFetch).toHaveBeenCalledTimes(1);
  expect(container.innerHTML).toBe("<main><p>orders</p></main>");
});

it("reads again once mounted when the first read failed", async () => {
  authFetch
    .mockRejectedValueOnce(new Error("down"))
    .mockResolvedValue(structuredClone(idleListing));
  const { app, container } = mountInBrowser(Page);
  mounted.push(app);
  for (let tick = 0; tick < 4; tick++) await settle();
  expect(authFetch).toHaveBeenCalledTimes(2);
  expect(container.innerHTML).toBe("<main><p>orders</p></main>");
});

it("waits for the background read of a return to the page, instead of looping on it", async () => {
  authFetch.mockResolvedValue(structuredClone(idleListing));
  const shown = ref(true);
  const { app, container } = mountInBrowser(
    defineComponent({
      setup: () => () => (shown.value ? h(Page) : h("aside")),
    }),
  );
  mounted.push(app);
  for (let tick = 0; tick < 4; tick++) await settle();
  expect(container.innerHTML).toBe("<main><p>orders</p></main>");

  shown.value = false;
  await settle();
  let answer: (listing: typeof idleListing) => void = () => {};
  authFetch.mockReturnValueOnce(new Promise((done) => (answer = done)));
  shown.value = true;
  for (let tick = 0; tick < 4; tick++) await settle();
  expect(container.innerHTML).toBe("<main><p>orders</p></main>");

  answer(structuredClone(idleListing));
  for (let tick = 0; tick < 4; tick++) await settle();
  expect(authFetch).toHaveBeenCalledTimes(2);
  expect(container.innerHTML).toBe("<main><p>orders</p></main>");
});

it("sizes the tile skeleton like the tile: icon well, pill, title, description and footer", async () => {
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  const render = async (
    props: InstanceType<typeof ModuleTileSkeleton>["$props"],
  ) => {
    const app = createSSRApp({ render: () => h(ModuleTileSkeleton, props) });
    app.component("USkeleton", {
      props: { class: { type: String, default: undefined } },
      setup: (componentProps: { class?: string }) => () =>
        h("i", { class: componentProps.class }),
    });
    return renderToString(app);
  };

  const installed = await render({});
  expect(installed).toContain("min-h-[228px]");
  expect(installed).toContain('class="size-9 rounded-[10px]"');
  expect(installed).toContain('class="h-5 w-16 rounded-full"');
  expect(installed).toContain("flex h-7 items-center");
  expect(installed.match(/h-\[1\.45em\]/g)).toHaveLength(2);
  expect(installed).toContain("py-[7px]");
  expect(installed).toContain('class="h-6 w-16 rounded-md"');
  expect(installed).not.toContain("h-[30px]");

  const store = await render({ isStore: true });
  expect(store).not.toContain("rounded-full");
  expect(store).toContain('class="h-[30px] rounded-[8px]"');
});
