// @vitest-environment jsdom
import { ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MeterBlock from "../layers/dms-ui/app/components/meter/MeterBlock.vue";
import { refreshPageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";
import { extraRuntime, mountExtra } from "./helpers/chart-extra-runtime";

let fail = false;
let app: ReturnType<typeof mountExtra>["app"] | undefined;
const fetch = vi.fn(async () => {
  if (fail) throw new Error("network");
  return { value: 8, max: 10 };
});

function render() {
  const mounted = mountExtra(MeterBlock, {
    componentId: "meter",
    pageId: "page",
    label: "Seats",
    fetchUrl: "/seats",
  });
  app = mounted.app;
  return mounted.root;
}

beforeEach(async () => {
  fail = false;
  fetch.mockClear();
  await extraRuntime(fetch);
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
});

afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

it("shows a failed load as an error with a retry, not as 0 / 100", async () => {
  fail = true;
  const root = render();
  await vi.waitFor(() =>
    expect(root.textContent).toContain("dms.table.load_error_title"),
  );
  expect(root.textContent).toContain("dms.table.load_error_retry");
  expect(root.textContent).toContain("Seats");
  expect(root.textContent).not.toContain("100");
  fail = false;
  root.querySelector("button")!.click();
  await vi.waitFor(() => expect(root.textContent).toMatch(/8\s*\/\s*10/));
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("keeps the last figures when only a refetch fails", async () => {
  const root = render();
  await vi.waitFor(() => expect(root.textContent).toMatch(/8\s*\/\s*10/));
  fail = true;
  await refreshPageBlocks();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(root.textContent).not.toContain("dms.table.load_error_title");
  expect(root.textContent).toMatch(/8\s*\/\s*10/);
});
