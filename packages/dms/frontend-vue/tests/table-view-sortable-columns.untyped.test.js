import { describe, expect, it } from "vitest";
import {
  sanitizeSorting,
  sortableColumnIds,
} from "../layers/dms-ui/app/entries/composables/table-view/utils/sortableColumns";

const columns = [
  { id: "name", accessorKey: "name", enableSorting: false },
  { id: "email", accessorKey: "email", enableSorting: false },
  { id: "due_date", accessorKey: "due_date", enableSorting: true },
  { id: "price", accessorKey: "price", enableSorting: false },
  {
    id: "completion_percentage",
    accessorKey: "completion_percentage",
    enableSorting: true,
  },
];
const sortable = sortableColumnIds(columns);

describe("sanitizeSorting", () => {
  it("survives malformed preferences", () => {
    expect(sanitizeSorting(undefined, sortable)).toEqual([]);
    expect(sanitizeSorting(null, sortable)).toEqual([]);
    expect(sanitizeSorting("due_date", sortable)).toEqual([]);
    expect(sanitizeSorting([{ id: 3 }], sortable)).toEqual([]);
  });
});
