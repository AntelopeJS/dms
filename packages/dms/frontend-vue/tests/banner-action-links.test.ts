/** @vitest-environment jsdom */
/**
 * A banner link navigates the way `navigateDms` does: a link that changes
 * only the query of the page on screen, written as a path or as a bare
 * query, stays in the browser, a link to
 * another page loads it, and a modified click (new tab, new window) is left
 * to the browser.
 */
import { createApp, h, nextTick } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App as InertiaApp, router as inertiaRouter } from "@inertiajs/vue3";
import UButton from "@nuxt/ui/components/Button.vue";
import {
  browserRuntime,
  engine,
  installBlockNetwork,
  registerBlockUi,
} from "./helpers/block-network-runtime";

const PAGE = "/orders";
const PENDING = `${PAGE}?status=pending`;

const serverVisit = vi.spyOn(inertiaRouter, "visit");
const browserVisit = vi.spyOn(inertiaRouter, "push");

const { default: BannerBlock } = await import(
  "../layers/dms-ui/app/components/blocks/BannerBlock.vue"
);

const mounted: Array<{ unmount: () => void }> = [];

function mountBanner(to: string): HTMLAnchorElement {
  const root = document.createElement("div");
  document.body.append(root);
  const page = {
    render: () =>
      h(BannerBlock, {
        componentId: "notice",
        pageId: "orders",
        title: "Orders waiting",
        actions: [{ label: "Pending", to }],
      }),
  };
  const app = createApp(InertiaApp, {
    initialPage: { component: "orders", props: {}, url: PAGE },
    initialComponent: page,
    resolveComponent: () => page,
  });
  const runtime = browserRuntime(app);
  Object.assign(runtime.route, { path: PAGE, fullPath: PAGE });
  registerBlockUi(app);
  app.component("UButton", UButton);
  app.mount(root);
  mounted.push(app);
  const link = root.querySelector("a");
  if (!link) throw new Error("the banner draws no link");
  return link;
}

async function settle(): Promise<void> {
  for (let round = 0; round < 10; round++) await Promise.resolve();
  await nextTick();
}

beforeEach(async () => {
  window.history.replaceState({}, "", PAGE);
  serverVisit.mockReset().mockImplementation(() => {});
  browserVisit.mockReset().mockImplementation(() => {});
  vi.stubGlobal("navigateDms", engine.navigateDms);
  await installBlockNetwork(async () => null);
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  document.body.replaceChildren();
});

it("keeps a link that changes only the query in the browser", async () => {
  const link = mountBanner(PENDING);
  expect(link.getAttribute("href")).toBe(PENDING);

  link.click();
  await settle();

  expect(serverVisit).not.toHaveBeenCalled();
  expect(browserVisit).toHaveBeenCalledWith(
    expect.objectContaining({ url: PENDING }),
  );
});

it("keeps a link written as a bare query in the browser", async () => {
  mountBanner("?status=pending").click();
  await settle();

  expect(serverVisit).not.toHaveBeenCalled();
  expect(browserVisit).toHaveBeenCalledWith(
    expect.objectContaining({ url: PENDING }),
  );
});

it("loads another page from the server", async () => {
  mountBanner("/customers").click();
  await settle();

  expect(browserVisit).not.toHaveBeenCalled();
  expect(serverVisit).toHaveBeenCalledWith(
    "/customers",
    expect.objectContaining({ preserveState: false }),
  );
});

it("leaves a click with a modifier to the browser", async () => {
  const link = mountBanner(PENDING);
  const click = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
  });

  link.dispatchEvent(click);
  await settle();

  expect(click.defaultPrevented).toBe(false);
  expect(serverVisit).not.toHaveBeenCalled();
  expect(browserVisit).not.toHaveBeenCalled();
});
