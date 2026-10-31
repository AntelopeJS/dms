/** @vitest-environment jsdom */
/**
 * A table view states what its reader sees on its root element: `ok` with
 * rows, `empty` with none, `error` when the list could not be read.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mountTableView,
  settleTable,
  tableViewRuntime,
} from "./helpers/table-view-runtime";

const STATE = "data-dms-block-state";
const apps: Array<{ unmount: () => void }> = [];
let list: () => Promise<unknown>;

async function stateOfMountedTable(): Promise<string | null | undefined> {
  const { app, container } = await mountTableView();
  apps.push(app);
  await settleTable();
  await settleTable();
  return container.querySelector(`[${STATE}]`)?.getAttribute(STATE);
}

beforeEach(async () => {
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  await tableViewRuntime(async () => list());
});

afterEach(() => apps.splice(0).forEach((app) => app.unmount()));

describe("TableView block state", () => {
  it("is ok when the list holds rows", async () => {
    list = async () => ({
      results: [{ _id: "1", name: "Ada" }],
      total: 1,
      offset: 0,
      limit: 10,
    });
    expect(await stateOfMountedTable()).toBe("ok");
  });

  it("is empty when the list holds no row", async () => {
    list = async () => ({ results: [], total: 0, offset: 0, limit: 10 });
    expect(await stateOfMountedTable()).toBe("empty");
  });

  it("is an error when the list could not be read", async () => {
    list = async () => {
      throw Object.assign(new Error("500"), { statusCode: 500 });
    };
    expect(await stateOfMountedTable()).toBe("error");
  });
});
