/**
 * The modules listing as a server runs it: every request it renders has its
 * own DMS app and its own state, and two renders of the modules page can be in
 * flight at once. Each one must fetch and render its own listing.
 */
import { ref, type Ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useModulesListing } from "../layers/dms-layout/app/composables/page/useModulesListing";

interface Render {
  app: Record<PropertyKey, unknown>;
  state: Map<string, Ref>;
  authFetch: ReturnType<typeof vi.fn>;
}

const ordersModule = {
  id: "orders",
  title: "Orders",
  description: "",
  icon: "i-lucide-package",
  hasAccess: true,
  landingSlug: "/modules/orders/list",
};
const billingModule = {
  id: "billing",
  title: "Billing",
  description: "",
  icon: "i-lucide-receipt",
  hasAccess: true,
  landingSlug: "/modules/billing/invoices",
};

let current: Render;

function createRender(): Render {
  return { app: {}, state: new Map(), authFetch: vi.fn() };
}

// What the renderer resolves from the component being set up: the app and
// the state of the request that component belongs to.
function inRender<T>(render: Render, callback: () => T): T {
  current = render;
  return callback();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubGlobal("useDmsApp", () => current.app);
  vi.stubGlobal("useDmsState", (key: string, initial: () => unknown) => {
    if (!current.state.has(key)) current.state.set(key, ref(initial()));
    return current.state.get(key);
  });
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: current.authFetch }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("fetches the listing of a render that starts while another render's fetch is in flight", async () => {
  const first = createRender();
  const second = createRender();
  const firstResponse = deferred<unknown[]>();
  first.authFetch.mockReturnValueOnce(firstResponse.promise);
  second.authFetch.mockResolvedValueOnce([billingModule]);

  const firstListing = inRender(first, () => useModulesListing());
  const firstLoad = inRender(first, () => firstListing.loadModulesListing());
  const secondListing = inRender(second, () => useModulesListing());
  const secondLoad = inRender(second, () => secondListing.loadModulesListing());
  firstResponse.resolve([ordersModule]);
  await Promise.all([firstLoad, secondLoad]);

  expect(secondListing.modules.value).toEqual([billingModule]);
  expect(second.authFetch).toHaveBeenCalledOnce();
  expect(firstListing.modules.value).toEqual([ordersModule]);
});

it("still shares one fetch between the callers of one render", async () => {
  const render = createRender();
  const response = deferred<unknown[]>();
  render.authFetch.mockReturnValueOnce(response.promise);

  const [page, widget] = inRender(render, () => [
    useModulesListing(),
    useModulesListing(),
  ]);
  const loads = inRender(render, () => [
    page.loadModulesListing(),
    widget.loadModulesListing(),
  ]);
  response.resolve([ordersModule]);
  await Promise.all(loads);

  expect(render.authFetch).toHaveBeenCalledOnce();
  expect(widget.modules.value).toEqual([ordersModule]);
});
