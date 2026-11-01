/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import {
  mountTableView,
  settleTable,
  tableViewRuntime,
} from "./helpers/table-view-runtime";

const apps: Array<{ unmount: () => void }> = [];
const TABS = [
  {
    id: "open",
    label: "Open",
    filter: { accessorKey: "status", value: "open" },
  },
];

async function mount(answerCounts: () => unknown) {
  await tableViewRuntime(async (url: string) => {
    if (url.endsWith("/count/batch")) return answerCounts();
    return { results: [], total: 3, offset: 0, limit: 10 };
  });
  const result = await mountTableView({ tabs: TABS });
  apps.push(result.app);
  await settleTable();
  return result.container;
}

const placeholders = (host: HTMLElement) =>
  host.querySelectorAll('[aria-hidden="true"][aria-label]');

afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  vi.unstubAllGlobals();
});

it("writes each tab's count once the batch answers", async () => {
  const host = await mount(() => ({ all: 3, open: 2 }));
  expect(host.textContent).toMatch(/Open\s*2/);
  expect(placeholders(host)).toHaveLength(0);
}, 20000);

it("leaves no placeholder in a tab whose counters failed to load", async () => {
  const host = await mount(() => {
    throw { statusCode: 500, data: { message: "count failed" } };
  });
  expect(host.textContent).toContain("Open");
  expect(placeholders(host)).toHaveLength(0);
}, 20000);
