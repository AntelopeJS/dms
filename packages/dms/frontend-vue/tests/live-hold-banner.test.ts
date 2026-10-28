// @vitest-environment jsdom
/**
 * The strip of a held table: "N new · Show", Show reading the rows again,
 * led by why the table holds by itself ("Table on hold · search active").
 */
import { createApp, h, type App } from "vue";
import { afterEach, expect, it, vi } from "vitest";

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

async function mountBanner(props: Record<string, unknown>) {
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, params?: { count?: number }) =>
      params ? `${key}:${params.count}` : key,
  }));
  const { default: LiveHoldBanner } = await import(
    "../layers/dms-ui/app/build/components/table-view/LiveHoldBanner.vue"
  );
  const host = document.createElement("div");
  app = createApp({ render: () => h(LiveHoldBanner, props) });
  app.component("UIcon", () => h("i"));
  app.component("UButton", (buttonProps: { label: string }, { attrs }) =>
    h("button", attrs, buttonProps.label),
  );
  app.mount(host);
  return host;
}

it("draws the banner and reads the rows on Show", async () => {
  const onShow = vi.fn();
  const host = await mountBanner({ count: 3, onShow });

  expect(host.textContent).toContain("dms.live.new_rows:3");
  host.querySelector("button")?.click();
  expect(onShow).toHaveBeenCalledTimes(1);
});

it("says why the table holds, with no count nor Show before anything came in", async () => {
  const host = await mountBanner({ count: 0, reason: "searching" });

  expect(host.textContent).toContain(
    "dms.live.table_held · dms.live.held_searching",
  );
  expect(host.textContent).not.toContain("dms.live.new_rows");
  expect(host.querySelector("button")).toBeNull();
});

it("adds the count and Show after the reason", async () => {
  const host = await mountBanner({ count: 2, reason: "rowOpen" });

  expect(host.textContent).toContain("dms.live.held_row_open");
  expect(host.textContent).toContain("dms.live.new_rows:2");
  expect(host.querySelector("button")).not.toBeNull();
});

it("words the count with missedLabel and adds the paused page's breakdown", async () => {
  const host = await mountBanner({
    count: 12,
    missedLabel: "$api.live.new_requests",
    detail: { text: "$api.live.in_5xx", params: { count: 2 }, tone: "error" },
  });

  expect(host.textContent).toContain("api.live.new_requests:12");
  expect(host.textContent).not.toContain("dms.live.new_rows");
  const detail = host.querySelector(".dms-live-hold-banner__detail");
  expect(detail?.textContent?.trim()).toBe("api.live.in_5xx:2");
  expect(detail?.classList.contains("text-error")).toBe(true);
});

it("draws a pill over the rows when floating, in place of the strip", async () => {
  const onShow = vi.fn();
  const host = await mountBanner({ count: 6, floating: true, onShow });
  const pill = host.querySelector(".dms-live-hold-banner")!;

  expect(pill.className).toContain("rounded-full");
  expect(pill.className).not.toContain("border-b");
  expect(host.textContent).toContain("dms.live.new_rows:6");
  host.querySelector("button")?.click();
  expect(onShow).toHaveBeenCalledTimes(1);
});

it("draws the pill opaque and lifted, announced, its Show a real button", async () => {
  const host = await mountBanner({ count: 4, floating: true });
  const pill = host.querySelector(".dms-live-hold-banner")!;

  expect(pill.getAttribute("role")).toBe("status");
  expect(pill.getAttribute("aria-live")).toBe("polite");
  expect(pill.className).toContain("bg-(--ui-bg)");
  expect(pill.className).toContain("shadow-(--dms-shadow-pop)");
  expect(pill.querySelector("button")?.tagName).toBe("BUTTON");
});
