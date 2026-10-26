import { expect } from "chai";
import {
  GetBlockType,
  ValidateBlockOptions,
} from "@antelopejs/interface-dms/base/block-types";
import { CodeBlock } from "@antelopejs/interface-dms/base";
import { Matrix } from "@antelopejs/interface-dms/base/matrix";
import type { MatrixProps } from "@antelopejs/interface-dms/base/matrix-types";

const COMPONENT_NAME = "dms-matrix-block";

/** Every option set at once, as a page author may write them. */
const FULL_OPTIONS: MatrixProps = {
  title: "Stock",
  description: "Pairs by store and size",
  fetchUrl: "/api/stock?article={{params.article}}",
  fetchUrlMethod: "GET",
  realtimeTopic: ["stock"],
  saveUrl: "/api/stock/save",
  saveUrlMethod: "POST",
  columns: [
    { id: "38", label: "38", kind: "number", integer: true, min: 0 },
    { id: "receivedAt", label: "Received", kind: "datetime" },
    {
      id: "status",
      label: "Status",
      kind: "select",
      options: [{ value: "ok", label: "OK", tone: "success" }],
      display: { type: "status_pill", options: { tones: { ok: "success" } } },
      excludeFromTotals: true,
    },
  ],
  rowHeader: { label: "Store", width: 200, numbers: true },
  editable: true,
  typeToEdit: true,
  saveMode: "staged",
  review: true,
  undoSeconds: 10,
  conflicts: "detect",
  enterMove: "right",
  rowPanel: { title: "Store", showJson: true, deepLink: true },
  selectable: true,
  columnFilters: ["38", "status"],
  fillActions: [
    {
      id: "clear",
      label: "Clear",
      url: "/api/stock/fill/clear",
      method: "POST",
    },
  ],
  pagination: "pages",
  pageSize: 50,
  pageSizes: [25, 50, 100],
  search: true,
  statusFilters: [{ id: "missing", label: "Missing", tone: "warning" }],
  facets: [{ id: "region", label: "Region", multiple: true }],
  sortable: true,
  urlState: false,
  grouping: {
    groupByField: "region",
    collapsible: true,
    collapseAbove: 300,
    count: true,
    subtotals: true,
  },
  totals: { rows: true, columns: true, label: "Total" },
  targets: {
    columns: { 38: 6 },
    total: 24,
    blockSave: true,
    message: "Split all",
  },
  crossHighlight: true,
  columnsMenu: true,
  resizableColumns: true,
  jumpToEmpty: true,
  keepEditedRows: true,
  exportCsv: true,
  legend: [{ label: "Out of range", hatched: true }],
  emptyLabel: "No store",
  maxHeight: "60vh",
  density: "compact",
};

/**
 * The Matrix block: a grid of rows by columns read and edited in place. Its
 * factory hands the options through, serializing the cell action's
 * component, and the catalog lists it with the schema of every option.
 */
describe("[unit] interfaces/dms-base — Matrix", () => {
  it("serializes under its block component name", () => {
    const serialized = Matrix({ title: "Stock" }).serializeSync();
    expect(serialized.componentName).to.equal(COMPONENT_NAME);
    expect(serialized.options).to.deep.include({ title: "Stock" });
  });

  it("takes the bare call of a page under construction", () => {
    const serialized = Matrix().serializeSync();
    expect(serialized.componentName).to.equal(COMPONENT_NAME);
    expect(serialized.options).to.deep.equal({});
  });

  it("hands every option through as written", () => {
    const { realtimeTopic: _topic, ...options } = FULL_OPTIONS;
    const serialized = Matrix(FULL_OPTIONS).serializeSync();
    expect(serialized.options).to.deep.include(options);
    expect(serialized.options?.grouping).to.deep.equal(FULL_OPTIONS.grouping);
  });

  it("serializes the component a cell action opens", () => {
    const serialized = Matrix({
      cellAction: {
        type: "drawer",
        direction: "right",
        title: "Order",
        component: CodeBlock({ code: "{{row.id}} {{row.column}}" }),
      },
    }).serializeSync();
    const action = serialized.options?.cellAction;
    expect(action?.type).to.equal("drawer");
    const component = action?.type === "drawer" ? action.component : undefined;
    expect(component?.componentName).to.be.a("string");
    expect(component?.options).to.deep.include({
      code: "{{row.id}} {{row.column}}",
    });
  });

  it("leaves a page or link cell action as it is", () => {
    const target = { type: "page" as const, url: "/stock/{{row.id}}" };
    const serialized = Matrix({ cellAction: target }).serializeSync();
    expect(serialized.options?.cellAction).to.deep.equal(target);
  });

  it("serializes the targets of its row actions", () => {
    const serialized = Matrix({
      rowActions: [
        {
          id: "revert",
          label: "Revert",
          icon: "i-ph-arrow-counter-clockwise",
          tone: "warning",
          visibleWhen: { field: "overridden", in: [true] },
          target: {
            type: "api",
            url: "/api/keys/revert?key={{row.id}}",
            method: "POST",
            successMessage: "Reverted",
          },
        },
        {
          id: "open",
          label: "Open",
          target: {
            type: "drawer",
            title: "Key",
            component: CodeBlock({ code: "{{row.id}}" }),
          },
        },
      ],
    }).serializeSync();
    const [revert, open] = serialized.options?.rowActions ?? [];
    expect(revert).to.deep.include({ id: "revert", tone: "warning" });
    expect(revert?.visibleWhen).to.deep.equal({
      field: "overridden",
      in: [true],
    });
    expect(revert?.target).to.deep.equal({
      type: "api",
      url: "/api/keys/revert?key={{row.id}}",
      method: "POST",
      successMessage: "Reverted",
    });
    const component =
      open?.target.type === "drawer" ? open.target.component : undefined;
    expect(component?.componentName).to.be.a("string");
    expect(component?.options).to.deep.include({ code: "{{row.id}}" });
  });

  it("is listed in the catalog with its schema", () => {
    const block = GetBlockType("Matrix");
    expect(block?.componentName).to.equal(COMPONENT_NAME);
    expect(block?.meta.group).to.equal("data");
    expect(block?.config.saveMode?.enum).to.deep.equal(["immediate", "staged"]);
    expect(block?.config.pagination?.enum).to.deep.equal([
      "none",
      "pages",
      "infinite",
    ]);
    expect(block?.config.grouping).to.not.equal(undefined);
    expect(block?.config.selectable?.type).to.equal("boolean");
    expect(block?.config.columnFilters).to.not.equal(undefined);
    expect(block?.config.rowActions).to.not.equal(undefined);
  });

  it("accepts a full set of options, and no option at all", () => {
    const {
      cellAction: _action,
      rowActions: _rowActions,
      ...options
    } = FULL_OPTIONS;
    expect(ValidateBlockOptions("Matrix", options).valid).to.equal(true);
    expect(ValidateBlockOptions("Matrix", {}).valid).to.equal(true);
    expect(
      ValidateBlockOptions("Matrix", { columnFilters: true }).valid,
    ).to.equal(true);
  });

  it("refuses values outside its enums", () => {
    const valid = (options: Record<string, unknown>) =>
      ValidateBlockOptions("Matrix", options).valid;
    expect(valid({ saveMode: "later" })).to.equal(false);
    expect(valid({ pageSize: 0 })).to.equal(false);
  });
});
