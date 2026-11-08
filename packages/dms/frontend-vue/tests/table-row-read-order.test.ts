/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "sortablejs";
import {
  mountTableView,
  settleTable,
  tableViewRuntime,
} from "./helpers/table-view-runtime";
import {
  publishTableEvent,
  startTableRealtime,
  stopTableRealtime,
} from "./helpers/table-runtime";
import { usePreferences } from "../layers/dms-core/app/composables/user/usePreferences";
import { CONTENT_LANGUAGE_HEADER } from "../layers/dms-core/app/composables/auth/useAuthFetch";

interface HeldRowRead {
  name: string;
  answer: () => void;
}

const apps: Array<{ unmount: () => void }> = [];
const rowReads: HeldRowRead[] = [];
let storedName = "Order v0";

const row = (name: string) => ({ _id: "r1", name });

const holdRowRead = () => {
  const name = storedName;
  return new Promise((resolve) => {
    rowReads.push({ name, answer: () => resolve(row(name)) });
  });
};

const save = async (name: string) => {
  storedName = name;
  await publishTableEvent("tableview:row:/api/orders", false, {
    type: "updated",
    payload: { ids: ["r1"] },
  });
  await settleTable();
};

const answer = async (read: HeldRowRead | undefined) => {
  read?.answer();
  await settleTable();
  await settleTable();
};

beforeEach(async () => {
  rowReads.length = 0;
  storedName = "Order v0";
  await tableViewRuntime(async (url: string) => {
    if (url.endsWith("/get")) return holdRowRead();
    if (url.endsWith("/count/batch")) return {};
    const results = [row(storedName)];
    return { results, total: results.length, offset: 0, limit: 10 };
  });
  usePreferences().removePreference("tables");
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", CONTENT_LANGUAGE_HEADER);
  await startTableRealtime();
});

afterEach(async () => {
  apps.splice(0).forEach((app) => app.unmount());
  await stopTableRealtime();
  vi.unstubAllGlobals();
});

it("keeps the newer row version when the older row read answers last", async () => {
  const { app, container } = await mountTableView();
  apps.push(app);
  await settleTable();
  await settleTable();
  expect(container.textContent).toContain("Order v0");

  await save("Order v1");
  await save("Order v2");
  expect(rowReads.map((read) => read.name)).toEqual(["Order v1", "Order v2"]);

  await answer(rowReads[1]);
  expect(container.textContent).toContain("Order v2");
  await answer(rowReads[0]);

  expect(container.textContent).toContain("Order v2");
  expect(container.textContent).not.toContain("Order v1");
});
