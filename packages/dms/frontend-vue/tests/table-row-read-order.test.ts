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
import type { ApiAnswer } from "./helpers/api-data-runtime";
import { usePreferences } from "../layers/dms-core/app/composables/user/usePreferences";
import { CONTENT_LANGUAGE_HEADER } from "../layers/dms-core/app/composables/auth/useAuthFetch";

interface HeldRead {
  kind: "get" | "list";
  answer: () => void;
  fail: () => void;
}

interface StoredRow {
  _id: string;
  name: string;
}

const apps: Array<{ unmount: () => void }> = [];
const reads: HeldRead[] = [];
let stored: StoredRow[] = [];
let holdLists = false;

const copy = ({ _id, name }: StoredRow) => ({ _id, name });

const listAnswer = (rows: StoredRow[]) => ({
  results: rows.map(copy),
  total: rows.length,
  offset: 0,
  limit: 10,
});

const hold = (kind: HeldRead["kind"], value: ApiAnswer) =>
  new Promise<ApiAnswer>((resolve, reject) => {
    reads.push({
      kind,
      answer: () => resolve(value),
      fail: () => reject(new Error("network")),
    });
  });

const serve = (url: string, options?: { query?: { id?: string } }) => {
  if (url.endsWith("/count/batch")) return Promise.resolve({});
  if (url.endsWith("/get")) {
    const row = stored.find(({ _id }) => _id === options?.query?.id);
    return hold("get", row ? copy(row) : undefined);
  }
  const answer = listAnswer(stored);
  return holdLists ? hold("list", answer) : Promise.resolve(answer);
};

const publish = async (type: string, ids: string[]) => {
  await publishTableEvent("tableview:row:/api/orders", false, {
    type,
    payload: { ids },
    ts: 1,
  });
  await settleTable();
};

const rename = (id: string, name: string) => {
  stored = stored.map((row) => (row._id === id ? { ...row, name } : row));
};

const save = async (name: string) => {
  rename("r1", name);
  await publish("updated", ["r1"]);
};

const settleRead = async () => {
  await settleTable();
  await settleTable();
};

const answer = async (read: HeldRead | undefined) => {
  read?.answer();
  await settleRead();
};

const readsOf = (kind: HeldRead["kind"]) =>
  reads.filter((read) => read.kind === kind);

const mountOrders = async (shown = "Order v0") => {
  const { app, container } = await mountTableView();
  apps.push(app);
  await settleRead();
  expect(container.textContent).toContain(shown);
  return container;
};

beforeEach(async () => {
  reads.length = 0;
  stored = [{ _id: "r1", name: "Order v0" }];
  holdLists = false;
  await tableViewRuntime(serve);
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
  const container = await mountOrders();

  await save("Order v1");
  await save("Order v2");
  const [older, newer] = readsOf("get");

  await answer(newer);
  expect(container.textContent).toContain("Order v2");
  await answer(older);

  expect(container.textContent).toContain("Order v2");
  expect(container.textContent).not.toContain("Order v1");
});

it("shows the older row version when the newer row read fails", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const container = await mountOrders();

  await save("Order v1");
  await save("Order v2");
  const [older, newer] = readsOf("get");
  newer?.fail();
  await settleRead();
  await answer(older);

  expect(container.textContent).toContain("Order v1");
});

it("keeps the list's newer version when a row read that left before it answers last", async () => {
  const container = await mountOrders();

  await save("Order v1");
  rename("r1", "Order v2");
  await publish("created", []);
  await settleRead();
  expect(container.textContent).toContain("Order v2");

  await answer(readsOf("get")[0]);

  expect(container.textContent).toContain("Order v2");
  expect(container.textContent).not.toContain("Order v1");
});

it("keeps the newer version when a list read that left before the save answers last", async () => {
  const container = await mountOrders();

  holdLists = true;
  rename("r1", "Order v1");
  await publish("created", []);
  holdLists = false;
  await save("Order v2");
  await settleRead();
  expect(container.textContent).toContain("Order v2");

  await answer(readsOf("list")[0]);

  expect(container.textContent).toContain("Order v2");
  expect(container.textContent).not.toContain("Order v1");
});

it("never writes a row read into the row that took its place after a delete", async () => {
  stored = [
    { _id: "r1", name: "Order A" },
    { _id: "r2", name: "Order B" },
  ];
  const container = await mountOrders("Order B");

  rename("r1", "Order A2");
  await publish("updated", ["r1"]);
  stored = stored.filter(({ _id }) => _id !== "r1");
  await publish("deleted", ["r1"]);
  await settleRead();
  expect(container.textContent).not.toContain("Order A");

  await answer(readsOf("get")[0]);

  expect(container.textContent).toContain("Order B");
  expect(container.textContent).not.toContain("Order A");
});

it("keeps the newer version when a row read of a view that unmounted answers after the view mounts again", async () => {
  const { app, container, remount } = await mountTableView();
  apps.push(app);
  await settleRead();

  await save("Order v1");
  rename("r1", "Order v2");
  remount();
  await settleRead();
  await settleRead();
  expect(container.textContent).toContain("Order v2");

  await answer(readsOf("get")[0]);

  expect(container.textContent).toContain("Order v2");
  expect(container.textContent).not.toContain("Order v1");
});
