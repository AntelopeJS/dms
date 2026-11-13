/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  mountTableView,
  settleTable,
  tableViewRuntime,
} from "./helpers/table-view-runtime";

const ROLES_URL = "/api/roles/select";
const requests: string[] = [];
const toasts = vi.fn(() => ({ id: "failure" }));
let unmount: (() => void) | undefined;

beforeEach(async () => {
  requests.length = 0;
  toasts.mockClear();
  await tableViewRuntime(async (url: string) => {
    requests.push(url);
    if (url === ROLES_URL) throw new Error("The roles could not be read");
    return { results: [], total: 0, offset: 0, limit: 10 };
  });
  vi.stubGlobal("useToast", () => ({
    add: toasts,
    update: vi.fn(),
    remove: vi.fn(),
  }));
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  vi.unstubAllGlobals();
});

it("reports a relation quick filter whose values fail to load", async () => {
  const { app } = await mountTableView({
    columns: [
      {
        id: "role",
        accessorKey: "role",
        header: "Role",
        listable: true,
        type: {
          id: "relation",
          compareModes: [],
          filterComponents: {},
          inputComponent: {
            componentName: "Relation",
            options: { searchUrl: ROLES_URL },
          },
        },
      },
    ],
    quickFilters: [{ field: "role" }],
  });
  unmount = () => app.unmount();
  await settleTable();
  await settleTable();

  expect(requests).toContain(ROLES_URL);
  expect(toasts).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ title: "dms.table.load_error_title" }),
  );
}, 20000);
