import { computed, ref, watch } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTableInlineEdit } from "../layers/dms-ui/app/build/composables/table-view/useTableInlineEdit";
import { resolveInlineEditColumns } from "../layers/dms-ui/app/build/composables/table-view/utils/inlineEdit";
import type { FormFieldOrGroup } from "../layers/dms-ui/app/composables/form/types/field";
import type {
  TableViewColumn,
  TableViewListResponse,
} from "../layers/dms-ui/app/composables/table-view/types";

type Api = Parameters<typeof useTableInlineEdit>[0]["api"];
type Row = Record<string, unknown>;

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const field = (
  id: string,
  componentName: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  type: "string",
  component: { componentName, options: {} },
  ...extra,
});

const EDIT_FIELDS: FormFieldOrGroup[] = [
  field("name", "dms-input-text", { required: true }),
  field("sku", "dms-input-text", { disabled: true }),
  field("price", "dms-input-number", { type: "price" }),
  field("active", "dms-switch", { type: "boolean" }),
  field("category", "dms-select", { type: "select" }),
  field("launch", "dms-date-picker", { type: "date" }),
  field("notes", "dms-rich-text", { type: "rich_text" }),
  field("title", "dms-input-text", { localized: true }),
  field("tags", "dms-select", {
    component: { componentName: "dms-select", options: { multiple: true } },
  }),
  {
    id: "stock-group",
    fields: [
      field("stock", "dms-input-number", {
        type: "number",
        disabledWhen: { field: "active", in: [false] },
      }),
    ],
  },
  field("internal", "dms-input-text"),
];

const column = (id: string, listable = true) =>
  ({
    id,
    accessorKey: id,
    header: id,
    listable,
    type: { id: "string" },
  }) as unknown as TableViewColumn;

const COLUMNS = [
  "name",
  "sku",
  "price",
  "active",
  "category",
  "launch",
  "notes",
  "title",
  "tags",
  "stock",
  "missing",
].map((id) => column(id));
COLUMNS.push(column("internal", false));

describe("which cells the grid edits in place", () => {
  it("edits the listed, writable fields of the edit form drawn by a simple control", () => {
    const columns = resolveInlineEditColumns(true, EDIT_FIELDS, COLUMNS);
    expect([...columns.keys()]).toEqual([
      "name",
      "price",
      "active",
      "category",
      "launch",
      "stock",
    ]);
    expect(columns.get("active")?.commit).toBe("toggle");
    expect(columns.get("category")?.commit).toBe("pick");
    expect(columns.get("price")?.commit).toBe("type");
  });

  it("keeps to the columns the option names", () => {
    const columns = resolveInlineEditColumns(
      { columns: ["price", "notes"] },
      EDIT_FIELDS,
      COLUMNS,
    );
    expect([...columns.keys()]).toEqual(["price"]);
  });

  it("edits nothing without the option or without an edit form", () => {
    expect(resolveInlineEditColumns(false, EDIT_FIELDS, COLUMNS).size).toBe(0);
    expect(resolveInlineEditColumns(true, undefined, COLUMNS).size).toBe(0);
  });
});

describe("a cell edited in place", () => {
  const rows = (): Row[] => [
    { _id: "p1", name: "Desk", price: 120, active: true, stock: 4 },
    { _id: "p2", name: "Lamp", price: 35, active: false, stock: 9 },
    { _id: "p3", name: "Chair", price: 80, active: true, locked: true },
  ];

  const setup = (api = vi.fn(async () => ({}))) => {
    const data = ref<TableViewListResponse<Row> | null>({
      results: rows(),
      total: 3,
      offset: 0,
      limit: 10,
    });
    const getRow = vi.fn(
      async (id: string): Promise<Row | undefined> => ({
        ...data.value!.results.find((row) => row._id === id)!,
        price: 151,
      }),
    );
    const onSaved = vi.fn();
    const onError = vi.fn();
    const edit = useTableInlineEdit<Row>({
      inlineEdit: true,
      editFields: EDIT_FIELDS,
      columns: COLUMNS,
      data,
      rowIdKey: "_id",
      labelKey: "name",
      location: "/api/products",
      api: api as unknown as Api,
      getDataType: () => undefined,
      canEditRow: (row) => row.locked !== true,
      isEnabled: computed(() => true),
      getRow,
      onSaved,
      onError,
    });
    const row = (index: number) => data.value!.results[index]!;
    return { edit, data, row, api, getRow, onSaved, onError };
  };

  it("sends nothing when the value did not change", async () => {
    const { edit, row, api } = setup();
    expect(edit.start(row(0), "price")).toBe(true);
    expect(edit.isEditing(row(0), "price")).toBe(true);
    expect(await edit.commit()).toBe(true);
    expect(api).not.toHaveBeenCalled();
    expect(edit.isEditing(row(0), "price")).toBe(false);
  });

  it("saves the new value by a partial edit and updates the row", async () => {
    const { edit, row, data, api, getRow, onSaved } = setup();
    edit.start(row(0), "price");
    edit.setDraft(150);
    const saving = edit.commit(row(0), "price");
    // The cell shows the value sent while it is saved.
    expect(edit.valueOf(row(0), "price")).toBe(150);
    expect(edit.isSaving(row(0), "price")).toBe(true);
    expect(await saving).toBe(true);
    expect(api).toHaveBeenCalledWith("/api/products/edit", {
      method: "PUT",
      query: { id: "p1" },
      body: { price: 150 },
    });
    // The row as the server answers it replaces the one listed.
    expect(getRow).toHaveBeenCalledWith("p1");
    expect(data.value?.results[0]?.price).toBe(151);
    expect(edit.isSaving(row(0), "price")).toBe(false);
    expect(onSaved).toHaveBeenCalled();
    expect(edit.isEditing(row(0), "price")).toBe(false);
  });

  it("sends an emptied text as null", async () => {
    const { edit, row, api } = setup();
    edit.start(row(1), "name");
    edit.setDraft("  ");
    await edit.commit();
    expect(api).toHaveBeenCalledWith("/api/products/edit", {
      method: "PUT",
      query: { id: "p2" },
      body: { name: null },
    });
  });

  it("keeps a refused value in its cell, marked invalid", async () => {
    const failure = Object.assign(new Error("refused"), { statusCode: 400 });
    const { edit, row, data, onError } = setup(
      vi.fn(async () => {
        throw failure;
      }),
    );
    edit.start(row(0), "price");
    edit.setDraft(-5);
    expect(await edit.commit()).toBe(false);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(edit.isEditing(row(0), "price")).toBe(true);
    expect(edit.isInvalid(row(0), "price")).toBe(true);
    expect(edit.draft.value).toBe(-5);
    expect(data.value?.results[0]?.price).toBe(120);
  });

  it("marks a cell refused after the user went on, without taking them back", async () => {
    const failure = Object.assign(new Error("refused"), { statusCode: 400 });
    const { edit, row, onError } = setup(
      vi.fn(async () => {
        throw failure;
      }),
    );
    edit.start(row(0), "name");
    edit.setDraft("Desk!");
    edit.start(row(1), "price");
    edit.setDraft(40);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    expect(edit.isEditing(row(1), "price")).toBe(true);
    expect(edit.draft.value).toBe(40);
    expect(edit.isInvalid(row(0), "name")).toBe(true);
    // Back on it, the cell opens on the value refused; Esc drops it.
    edit.cancel();
    edit.start(row(0), "name");
    expect(edit.draft.value).toBe("Desk!");
    edit.cancel();
    expect(edit.isInvalid(row(0), "name")).toBe(false);
  });

  it("drops a refusal once the row brings another value of the field", async () => {
    const failure = Object.assign(new Error("refused"), { statusCode: 400 });
    const { edit, row, data } = setup(
      vi.fn(async () => {
        throw failure;
      }),
    );
    edit.start(row(0), "name");
    edit.setDraft("Desk!");
    await edit.commit();
    edit.start(row(1), "price");
    expect(edit.isInvalid(row(0), "name")).toBe(true);
    // A realtime update or a refresh: the server's row has another name.
    data.value = {
      ...data.value!,
      results: data.value!.results.map((entry, index) =>
        index === 0 ? { ...entry, name: "Oak desk" } : entry,
      ),
    };
    expect(edit.isInvalid(row(0), "name")).toBe(false);
    edit.cancel();
    edit.start(row(0), "name");
    expect(edit.draft.value).toBe("Oak desk");
  });

  it("closes the cell when the refusal names other fields only", async () => {
    const failure = Object.assign(new Error("refused"), {
      statusCode: 400,
      data: { code: "missing_mandatory_fields", fields: ["category"] },
    });
    const { edit, row, onError } = setup(
      vi.fn(async () => {
        throw failure;
      }),
    );
    edit.start(row(0), "price");
    edit.setDraft(99);
    expect(await edit.commit()).toBe(false);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(edit.isEditing(row(0), "price")).toBe(false);
    expect(edit.isInvalid(row(0), "price")).toBe(false);
  });

  it("saves the cell left when another one opens", async () => {
    const { edit, row, api } = setup();
    edit.start(row(0), "name");
    edit.setDraft("Standing desk");
    edit.start(row(1), "price");
    expect(edit.isEditing(row(1), "price")).toBe(true);
    await vi.waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/products/edit", {
        method: "PUT",
        query: { id: "p1" },
        body: { name: "Standing desk" },
      }),
    );
    expect(edit.isEditing(row(1), "price")).toBe(true);
  });

  it("saves a switch as it toggles, without opening the cell", async () => {
    const { edit, row, api } = setup();
    expect(await edit.toggle(row(1), "active", true)).toBe(true);
    expect(api).toHaveBeenCalledWith("/api/products/edit", {
      method: "PUT",
      query: { id: "p2" },
      body: { active: true },
    });
    expect(edit.isEditing(row(1), "active")).toBe(false);
  });

  it("leaves alone a row the edit rule refuses and a field its condition locks", () => {
    const { edit, row } = setup();
    expect(edit.isCellEditable(row(2), "price")).toBe(false);
    expect(edit.start(row(2), "price")).toBe(false);
    // `stock` is locked while the row is inactive.
    expect(edit.isCellEditable(row(0), "stock")).toBe(true);
    expect(edit.isCellEditable(row(1), "stock")).toBe(false);
    expect(edit.isCellEditable(row(0), "notes")).toBe(false);
  });

  it("names a cell's input by its row", () => {
    const { edit, row } = setup();
    expect(edit.rowLabel(row(1))).toBe("Lamp");
  });
});
