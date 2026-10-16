// @vitest-environment jsdom
/**
 * The modules catalog through the runtime's real async data: a server render
 * reads it for a platform owner and hands it to the browser, which does not
 * ask again (its live readouts would no longer match the markup); a member
 * reads nothing; two renders in flight at once each render their own.
 */
import { computed, defineComponent, h, nextTick, ref, type App } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hydrate, serverRender, stubApiData } from "./helpers/api-data-runtime";
import { useModulesListing } from "../layers/dms-layout/app/composables/page/useModulesListing";

const ordersModule = { id: "orders", title: "Orders", hasAccess: true };
const billingModule = { id: "billing", title: "Billing", hasAccess: true };

const authFetch = vi.fn();
const isOwner = ref(true);
const mounted: App[] = [];

const Catalog = defineComponent({
  async setup() {
    const listing = useModulesListing();
    await listing.loadModulesListing();
    return () =>
      h(
        "p",
        listing.loadingError.value?.kind ??
          (listing.modules.value ?? []).map((entry) => entry.id).join(","),
      );
  },
});
const Page = defineComponent({
  setup: () => () => h("main", [h(Catalog)]),
});

beforeEach(() => {
  isOwner.value = true;
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("HTTP_FORBIDDEN", 403);
  vi.stubGlobal("useIsOwner", () => computed(() => isOwner.value));
  stubApiData(authFetch);
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("hands the listing the server rendered to the browser, which does not ask again", async () => {
  authFetch.mockResolvedValue([ordersModule]);
  const { html, payload } = await serverRender(Page);
  expect(html).toBe("<main><p>orders</p></main>");
  expect(authFetch).toHaveBeenCalledTimes(1);

  authFetch.mockClear();
  const { app, container } = hydrate(Page, html, payload);
  mounted.push(app);
  await nextTick();
  await new Promise((done) => setTimeout(done, 0));
  expect(authFetch).not.toHaveBeenCalled();
  expect(container.innerHTML).toBe(html);
});

it("reads nothing for a member", async () => {
  isOwner.value = false;
  const { html } = await serverRender(Page);
  expect(html).toBe("<main><p></p></main>");
  expect(authFetch).not.toHaveBeenCalled();
});

it("shows a refused listing as forbidden", async () => {
  authFetch.mockRejectedValue(
    Object.assign(new Error("Forbidden"), { statusCode: 403 }),
  );
  const { html } = await serverRender(Page);
  expect(html).toBe("<main><p>forbidden</p></main>");
});

it("renders each request's own listing when two renders are in flight at once", async () => {
  let answerFirst!: (value: unknown) => void;
  authFetch
    .mockReturnValueOnce(
      new Promise((resolve) => {
        answerFirst = resolve;
      }),
    )
    .mockResolvedValueOnce([billingModule]);
  const first = serverRender(Page);
  const second = serverRender(Page);
  await new Promise((done) => setTimeout(done, 0));
  answerFirst([ordersModule]);
  expect((await first).html).toBe("<main><p>orders</p></main>");
  expect((await second).html).toBe("<main><p>billing</p></main>");
});
