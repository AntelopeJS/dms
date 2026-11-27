// @vitest-environment jsdom
/**
 * A table view states what its reader sees on its root element: `ok` with
 * rows, `empty` with none, `error` when the list could not be read.
 *
 * @packageDocumentation
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableViewConfig } from "../layers/dms-ui/app/composables/table-view/types";
import type { Data } from "../layers/dms-ui/app/types/table/base";
import {
  mountTableView,
  settleTable,
  tableViewRuntime,
} from "./helpers/table-view-runtime";

const STATE = "data-dms-block-state";
const apps: Array<{ unmount: () => void }> = [];
type ListAnswer = {
  results: { _id: string; name: string; stage?: string }[];
  total: number;
  offset: number;
  limit: number;
};

let list: () => Promise<ListAnswer>;

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

/** A table opening on its board, which reads its cards column by column. */
const boardConfig: Partial<TableViewConfig<Data>> = {
  columns: [
    {
      id: "stage",
      accessorKey: "stage",
      header: "Stage",
      listable: true,
      type: {
        id: "select",
        compareModes: ["is"],
        filterComponents: {},
        inputComponent: {
          componentName: "Select",
          options: { items: [{ value: "lead", label: "Lead" }] },
        },
      },
    },
  ],
  displays: [
    { id: "table" },
    { id: "kanban", options: { groupByField: "stage" } },
  ],
  defaultDisplay: "kanban",
};

/** The state of a table opening on its board, once the board answered. */
async function stateOfMountedBoard(): Promise<string | null | undefined> {
  const { app, container } = await mountTableView(boardConfig);
  apps.push(app);
  const state = () =>
    container.querySelector(`[${STATE}]`)?.getAttribute(STATE);
  await vi.waitFor(() => expect(state()).toMatch(/^(ok|empty|error)$/));
  return state();
}

describe("TableView block state on its board", () => {
  it("is ok when the board shows cards", async () => {
    list = async () => ({
      results: [{ _id: "1", name: "Ada", stage: "lead" }],
      total: 1,
      offset: 0,
      limit: 10,
    });
    expect(await stateOfMountedBoard()).toBe("ok");
  });

  it("is empty when the board shows no card", async () => {
    list = async () => ({ results: [], total: 0, offset: 0, limit: 10 });
    expect(await stateOfMountedBoard()).toBe("empty");
  });
});
