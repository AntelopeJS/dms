// @vitest-environment jsdom
import { ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";
import { refreshPageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";
import { extraRuntime, mountExtra } from "./helpers/chart-extra-runtime";

let fail = false;
let items = [{ id: "a", title: "GET /orders", value: 1864 }];
let app: ReturnType<typeof mountExtra>["app"] | undefined;
const fetch = vi.fn(async () => {
  if (fail) throw new Error("network");
  return { items };
});

function render() {
  const mounted = mountExtra(TopListCard, {
    title: "Slowest routes",
    componentId: "slowest",
    pageId: "overview",
    fetchUrl: "/slowest",
    emptyLabel: "Nothing slow",
  });
  app = mounted.app;
  return mounted.root;
}

beforeEach(async () => {
  fail = false;
  items = [{ id: "a", title: "GET /orders", value: 1864 }];
  fetch.mockClear();
  await extraRuntime(fetch);
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
});

afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

it("shows a failed load as an error with a retry, not as an empty list", async () => {
  fail = true;
  const root = render();
  await vi.waitFor(() =>
    expect(root.textContent).toContain("dms.table.load_error_title"),
  );
  expect(root.textContent).toContain("dms.table.load_error_retry");
  expect(root.textContent).not.toContain("Nothing slow");
  fail = false;
  root.querySelector("button")!.click();
  await vi.waitFor(() => expect(root.textContent).toContain("GET /orders"));
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("keeps the empty state for a list that loaded without rows", async () => {
  items = [];
  const root = render();
  await vi.waitFor(() => expect(root.textContent).toContain("Nothing slow"));
  expect(root.textContent).not.toContain("dms.table.load_error_title");
});

it("keeps the last rows when only a refetch fails", async () => {
  const root = render();
  await vi.waitFor(() => expect(root.textContent).toContain("GET /orders"));
  fail = true;
  await refreshPageBlocks();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(root.textContent).toContain("GET /orders");
  expect(root.textContent).not.toContain("dms.table.load_error_title");
});
