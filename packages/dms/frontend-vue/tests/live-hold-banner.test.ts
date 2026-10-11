// @vitest-environment jsdom
/**
 * The strip of a held table: "N new · Show", Show reading the rows again.
 */
import { createApp, h, type App } from "vue";
import { afterEach, expect, it, vi } from "vitest";

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

it("draws the banner and reads the rows on Show", async () => {
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, params?: { count?: number }) =>
      params ? `${key}:${params.count}` : key,
  }));
  const { default: LiveHoldBanner } = await import(
    "../layers/dms-ui/app/build/components/table-view/LiveHoldBanner.vue"
  );
  const onShow = vi.fn();
  const host = document.createElement("div");
  app = createApp({
    render: () => h(LiveHoldBanner, { count: 3, onShow }),
  });
  app.component("UIcon", () => h("i"));
  app.component("UButton", (props: { label: string }, { attrs }) =>
    h("button", attrs, props.label),
  );
  app.mount(host);

  expect(host.textContent).toContain("dms.live.new_rows:3");
  host.querySelector("button")?.click();
  expect(onShow).toHaveBeenCalledTimes(1);
});
