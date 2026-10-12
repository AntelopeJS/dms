// @vitest-environment jsdom
/**
 * The strip of a held table: "N new · Show", Show reading the rows again,
 * led by why the table holds by itself ("Table on hold · search active").
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

it("has every reason in English and French", () => {
  for (const file of ["ui-en-GB.json", "ui-fr-FR.json"]) {
    const live = JSON.parse(
      readFileSync(
        resolve(__dirname, `../layers/dms-ui/i18n/locales/${file}`),
        "utf8",
      ),
    ).dms.live;
    for (const key of [
      "table_held",
      "held_row_open",
      "held_searching",
      "held_sorted",
      "held_scrolled",
    ]) {
      expect(live[key], `${file} ${key}`).toBeTruthy();
    }
  }
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
