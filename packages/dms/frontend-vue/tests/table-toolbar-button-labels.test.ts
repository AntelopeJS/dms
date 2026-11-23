/**
 * @packageDocumentation
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  mountTableView,
  settleTable,
  tableViewRuntime,
} from "./helpers/table-view-runtime";

const apps: Array<{ unmount: () => void }> = [];

beforeEach(async () => {
  await tableViewRuntime(async () => ({
    results: [],
    total: 0,
    offset: 0,
    limit: 10,
  }));
});

afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
});

it("names the sort and menu buttons of the toolbar", async () => {
  const { app, container } = await mountTableView({
    columns: [
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        listable: true,
        enableSorting: true,
        type: {
          id: "string",
          compareModes: [],
          filterComponents: {},
          inputComponent: { componentName: "Input" },
        },
      },
    ],
  });
  apps.push(app);
  await settleTable();
  expect(
    container
      .querySelector("#sorting-trigger [aria-label]")
      ?.getAttribute("aria-label"),
  ).toBe("dms.table.sort_title");
  expect(
    container.querySelector("#table-menu")?.getAttribute("aria-label"),
  ).toBe("dms.table.options_title");
});
