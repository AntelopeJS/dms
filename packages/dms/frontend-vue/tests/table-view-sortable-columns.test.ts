import { describe, expect, it, vi } from "vitest";
import enGB from "../layers/dms-ui/i18n/locales/ui-en-GB.json";
import frFR from "../layers/dms-ui/i18n/locales/ui-fr-FR.json";
import {
  defaultSortingState,
  headerSortCue,
  isColumnSortable,
  isDefaultSorting,
  isSameSorting,
  isUnsortableFieldError,
  resolveDefaultSort,
  resolveDefaultSortConfig,
  sanitizeSorting,
  sortableColumnIds,
  sortDirectionLabelKey,
  sortValueKind,
} from "../layers/dms-ui/app/build/composables/table-view/utils/sortableColumns";

// The Drawer demo's task columns: only `due_date` and
// `completion_percentage` are `@Sortable()` on `/api/task`.
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

describe("sortable column gating", () => {
  it("keeps only the columns the backend marks sortable", () => {
    expect([...sortable]).toEqual(["due_date", "completion_percentage"]);
  });

  it("treats a hand-built column without the flag as sortable", () => {
    expect(isColumnSortable({ id: "x" })).toBe(true);
    expect(isColumnSortable({ id: "x", enableSorting: false })).toBe(false);
    expect([...sortableColumnIds([{ accessorKey: "x" }])]).toEqual(["x"]);
  });
});

describe("sanitizeSorting", () => {
  it("keeps a sort on a sortable column", () => {
    expect(sanitizeSorting([{ id: "due_date", desc: true }], sortable)).toEqual(
      [{ id: "due_date", desc: true }],
    );
  });

  it("drops a saved or pasted sort on a non-sortable column", () => {
    expect(sanitizeSorting([{ id: "price", desc: false }], sortable)).toEqual(
      [],
    );
    expect(sanitizeSorting([{ id: "gone", desc: false }], sortable)).toEqual(
      [],
    );
  });

  it("sends a single column: the route sorts on one key", () => {
    expect(
      sanitizeSorting(
        [
          { id: "completion_percentage", desc: false },
          { id: "due_date", desc: true },
        ],
        sortable,
      ),
    ).toEqual([{ id: "completion_percentage", desc: false }]);
  });

  it("survives malformed preferences", () => {
    expect(sanitizeSorting(undefined, sortable)).toEqual([]);
    expect(sanitizeSorting(null, sortable)).toEqual([]);
    expect(sanitizeSorting("due_date" as unknown as never[], sortable)).toEqual(
      [],
    );
    expect(sanitizeSorting([{ id: 3 } as unknown as never], sortable)).toEqual(
      [],
    );
  });

  it("drops a sort on a column the route refused since", () => {
    const afterRefusal = new Set(
      [...sortable].filter((id) => id !== "due_date"),
    );
    expect(
      sanitizeSorting([{ id: "due_date", desc: false }], afterRefusal),
    ).toEqual([]);
  });
});

describe("resolveDefaultSort", () => {
  it("uses a sortable default sort", () => {
    expect(
      resolveDefaultSort({ field: "due_date", desc: true }, sortable),
    ).toEqual([{ id: "due_date", desc: true }]);
    expect(resolveDefaultSort({ field: "due_date" }, sortable)).toEqual([
      { id: "due_date", desc: false },
    ]);
  });

  it("ignores a non-sortable default sort with a warning", () => {
    const warn = vi.fn();
    expect(resolveDefaultSort({ field: "name" }, sortable, warn)).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('"name"');
  });

  it("has nothing to resolve without a default sort", () => {
    expect(resolveDefaultSort(undefined, sortable)).toEqual([]);
  });
});

describe("isSameSorting", () => {
  it("compares column and direction", () => {
    expect(
      isSameSorting([{ id: "a", desc: false }], [{ id: "a", desc: false }]),
    ).toBe(true);
    expect(
      isSameSorting([{ id: "a", desc: false }], [{ id: "a", desc: true }]),
    ).toBe(false);
    expect(isSameSorting([], [{ id: "a", desc: false }])).toBe(false);
    expect(isSameSorting([], [])).toBe(true);
  });
});

describe("isUnsortableFieldError (recovery trigger)", () => {
  it("recognises the data API's refusal of a sort key", () => {
    expect(
      isUnsortableFieldError({
        name: "FetchError",
        statusCode: 400,
        data: "Field is not sortable.",
      }),
    ).toBe(true);
    expect(
      isUnsortableFieldError({
        statusCode: 400,
        data: { message: "Field is not sortable." },
      }),
    ).toBe(true);
    expect(
      isUnsortableFieldError({
        response: { status: 400 },
        message: '[GET] "/api/task/list": 400 Field is not sortable.',
      }),
    ).toBe(true);
  });

  it("leaves every other failure to the error panel", () => {
    expect(
      isUnsortableFieldError({ statusCode: 400, data: "Invalid filter." }),
    ).toBe(false);
    expect(
      isUnsortableFieldError({
        statusCode: 500,
        data: "Field is not sortable.",
      }),
    ).toBe(false);
    expect(isUnsortableFieldError({ statusCode: 403, data: "Forbidden" })).toBe(
      false,
    );
    expect(isUnsortableFieldError(undefined)).toBe(false);
    expect(isUnsortableFieldError("Field is not sortable.")).toBe(false);
  });
});

describe("stable default sort", () => {
  it("falls back to a sortable creation date, newest first", () => {
    const withCreated = new Set(["createdAt", "due_date"]);
    expect(resolveDefaultSortConfig(undefined, withCreated)).toEqual({
      field: "createdAt",
      desc: true,
    });
    expect(
      resolveDefaultSortConfig(undefined, new Set(["created_at"])),
    ).toEqual({ field: "created_at", desc: true });
  });

  it("invents nothing without a sortable creation date", () => {
    // The task demos list `created_at`, but not as @Sortable.
    expect(resolveDefaultSortConfig(undefined, sortable)).toBeUndefined();
  });

  it("never replaces a declared default sort, even an ignored one", () => {
    const warn = vi.fn();
    expect(
      resolveDefaultSortConfig({ field: "name" }, new Set(["createdAt"]), warn),
    ).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("header sort cue", () => {
  it("draws nothing on a column that cannot be sorted", () => {
    expect(
      headerSortCue({ canSort: false, sorted: false, isDefaultSorting: false }),
    ).toBe("none");
    // Even a stale sort state on it never shows.
    expect(
      headerSortCue({ canSort: false, sorted: "asc", isDefaultSorting: true }),
    ).toBe("none");
  });

  it("draws the neutral cue on an unsorted sortable column", () => {
    expect(
      headerSortCue({ canSort: true, sorted: false, isDefaultSorting: true }),
    ).toBe("idle");
  });

  it("tells the default sort from the user's", () => {
    expect(
      headerSortCue({ canSort: true, sorted: "desc", isDefaultSorting: true }),
    ).toBe("default");
    expect(
      headerSortCue({ canSort: true, sorted: "desc", isDefaultSorting: false }),
    ).toBe("active");
  });
});

describe("default sort indicator", () => {
  const defaultSort = { field: "due_date", desc: true };

  it("is on while the list keeps its default sort", () => {
    expect(
      isDefaultSorting([{ id: "due_date", desc: true }], defaultSort),
    ).toBe(true);
  });

  it("is off once the user sorts, reverses or clears the sort", () => {
    expect(
      isDefaultSorting(
        [{ id: "completion_percentage", desc: false }],
        defaultSort,
      ),
    ).toBe(false);
    expect(
      isDefaultSorting([{ id: "due_date", desc: false }], defaultSort),
    ).toBe(false);
    expect(isDefaultSorting([], defaultSort)).toBe(false);
  });

  it("never shows without a default sort", () => {
    expect(isDefaultSorting([], undefined)).toBe(false);
    expect(isDefaultSorting([{ id: "due_date", desc: true }], undefined)).toBe(
      false,
    );
  });

  it("resets to the default sort, or to none without one", () => {
    expect(defaultSortingState(defaultSort)).toEqual([
      { id: "due_date", desc: true },
    ]);
    expect(defaultSortingState({ field: "name" })).toEqual([
      { id: "name", desc: false },
    ]);
    expect(defaultSortingState(undefined)).toEqual([]);
  });
});

describe("sort direction labels", () => {
  it("fit the column's data type", () => {
    expect(sortValueKind("percentage")).toBe("number");
    expect(sortValueKind("price")).toBe("number");
    expect(sortValueKind("date")).toBe("date");
    expect(sortValueKind("string")).toBe("text");
    expect(sortValueKind(undefined)).toBe("text");
  });

  it("are translated in English and French", () => {
    const lookup = (messages: unknown, key: string) =>
      key
        .split(".")
        .reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)?.[part],
          messages,
        );
    for (const kind of ["number", "date", "text"] as const) {
      for (const desc of [false, true]) {
        const key = sortDirectionLabelKey(kind, desc);
        expect(typeof lookup(enGB, key), key).toBe("string");
        expect(typeof lookup(frFR, key), key).toBe("string");
      }
    }
    expect(lookup(enGB, "dms.sort.direction.date.desc")).toBe(
      "newest → oldest",
    );
    expect(lookup(frFR, "dms.sort.default_sort")).toBe("Tri par défaut");
  });
});
