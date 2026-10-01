import {
  Controller,
  HTTPResult,
  type RequestContext,
} from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import {
  type DataControllerCallback,
  DataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  ModelReference,
} from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as tableViewImpl from "../../../../implementations/dms-base/table-view";
import { applyArchiveFilter } from "../../../../implementations/dms-base/search-route";
import { evaluateRowActionRule } from "../../../../utils/row-action-rule-evaluator";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { permissionMap } from "@antelopejs/interface-dms/page/registry";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types";
import {
  ArchiveField,
  Column,
  TableView,
  TableViewMeta,
  type TableViewOptionsSerialized,
  TableViewRoutes,
  validateRowsAgainstRule,
} from "@antelopejs/interface-dms/base/table-view";
import {
  actionPermissionIds,
  resolveActingTableViews,
} from "@antelopejs/interface-dms/base/table-view/auth";
import {
  combineRowRules,
  createValidatedRoute,
} from "@antelopejs/interface-dms/base/table-view/row-rules";
import { appendTableViewKey } from "@antelopejs/interface-dms/base/table-view/factory-helpers";
import type { ComponentBuilder } from "@antelopejs/interface-dms/component";

// Several table views mount one controller and share its data routes, never
// their row rules: a write is checked against the rules of the table it comes
// from (`?tableView=`), so the first table declaring a rule no longer imposes
// it on every other page over the same data.

const SCHEMA = "row-rules-per-table-test";
const TABLE = "tasks";
const NOT_HIGH = { field: "priority", notEquals: "high" } as const;
const KEY_RULED = "pages.conditional.table";
const KEY_FREE = "pages.drawer.table";
const KEY_ARCHIVE = "pages.archive.table";
const HTTP_FORBIDDEN = 403;

@RegisterTable(TABLE, SCHEMA)
class Task extends Table {
  @Field("string")
  declare priority: string;
  @Field("boolean")
  declare isArchived: boolean;
}
class TaskModel extends BasicDataModel(Task, TABLE) {}

class SharedTaskAPI extends DataController(
  Task,
  { delete: TableViewRoutes.Delete },
  Controller("/api/row-rules-per-table"),
) {
  @ModelReference()
  @Model(TaskModel)
  declare model: TaskModel;

  // An editable column: the table views get an edit form, hence an edit action.
  @Column({ name: "Priority", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare priority: string;

  @ArchiveField()
  declare isArchived: boolean;
}

type Row = { _id: string; priority: string; isArchived?: boolean };

function createTable(rows: Map<string, Row>) {
  return {
    getAll(ids: string[]) {
      const found = ids
        .map((id) => rows.get(id))
        .filter((row): row is Row => !!row);
      return Object.assign(Promise.resolve(found), {
        delete: async () => {
          for (const row of found) rows.delete(row._id);
          return found.length;
        },
      });
    },
  };
}

// "high" is refused by the conditional table's rule; "archived" is the only
// row archived; "legacy" was created before the archive field existed.
function createRows(): Map<string, Row> {
  return new Map<string, Row>([
    ["low", { _id: "low", priority: "low", isArchived: false }],
    ["high", { _id: "high", priority: "high", isArchived: false }],
    ["archived", { _id: "archived", priority: "high", isArchived: true }],
    ["legacy", { _id: "legacy", priority: "low" }],
  ]);
}
const ALL_IDS = ["low", "high", "archived", "legacy"];

const controller = new SharedTaskAPI();
const meta = GetMetadata(SharedTaskAPI, TableViewMeta);
let rows: Map<string, Row>;

// The table views of three pages, stamped as their page would stamp them.
const ruled = TableView(SharedTaskAPI, {
  realtime: false,
  rowActions: {
    delete: { isEnabled: true, rule: NOT_HIGH },
    edit: { isEnabled: true, rule: NOT_HIGH },
    hasSelection: true,
  },
});
const free = TableView(SharedTaskAPI, {
  realtime: false,
  rowActions: { delete: true, edit: true, hasSelection: true },
});
const archive = TableView(SharedTaskAPI, {
  realtime: false,
  archiveMode: true,
  rowActions: { archive: true, restore: true, hasSelection: true },
});

const remove = createValidatedRoute(
  {
    func: function (_ctx: RequestContext, params: { id: string[] }) {
      return createTable(rows).getAll(params.id).delete();
    },
    args: [],
    method: "delete",
  } as DataControllerCallback,
  "delete",
);

const edit = createValidatedRoute(
  {
    func: () => ({ edited: true }),
    args: [],
    method: "put",
  } as DataControllerCallback,
  "edit",
);

function context(tableKey?: string): RequestContext {
  const url = new URL("http://localhost/api/row-rules-per-table/delete");
  if (tableKey) url.searchParams.set("tableView", tableKey);
  return { url } as RequestContext;
}

function deleteFrom(tableKey: string | undefined, ids: string[]) {
  return remove.func.call(controller, context(tableKey), { id: ids });
}

async function rejectionOf(run: () => unknown): Promise<HTTPResult> {
  try {
    await run();
  } catch (error) {
    expect(error).to.be.instanceOf(HTTPResult);
    return error as HTTPResult;
  }
  throw new Error("expected a refusal");
}

describe("[unit] TableView row rules belong to the table declaring them", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(
      { validateRowsAgainstRule },
      { validateRowsAgainstRule: tableViewImpl.validateRowsAgainstRule },
    );
    permissionMap.set(ruled, KEY_RULED);
    permissionMap.set(free, KEY_FREE);
    permissionMap.set(archive, KEY_ARCHIVE);
  });

  beforeEach(() => {
    rows = createRows();
    controller.model = { table: createTable(rows) } as never;
  });

  after(() => {
    for (const builder of [ruled, free, archive]) permissionMap.delete(builder);
  });

  it("no longer turns the first table's rules into the controller's", () => {
    expect(meta.controllerRowActionRules).to.equal(undefined);
    expect(meta.rowScopeOf(ruled)?.rowActions?.delete).to.deep.equal({
      isEnabled: true,
      rule: NOT_HIGH,
    });
    expect(meta.rowScopeOf(free)?.rowActions?.delete).to.equal(true);
  });

  it("deletes every selected row from a table without rules", async () => {
    expect(await deleteFrom(KEY_FREE, ["low", "high", "legacy"])).to.equal(3);
    expect([...rows.keys()]).to.deep.equal(["archived"]);
  });

  it("still applies a table's own rules to the writes coming from it", async () => {
    expect(await deleteFrom(KEY_RULED, ["low", "high", "legacy"])).to.equal(2);
    expect([...rows.keys()]).to.deep.equal(["high", "archived"]);
    expect(await deleteFrom(KEY_RULED, ["high"])).to.deep.equal({
      deleted: 0,
    });
  });

  it("refuses an edit the named table's rule refuses, and only there", async () => {
    const error = await rejectionOf(() =>
      edit.func.call(controller, context(KEY_RULED), { id: "high" }),
    );
    expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
    expect(
      await edit.func.call(controller, context(KEY_FREE), { id: "high" }),
    ).to.deep.equal({ edited: true });
  });

  it("enforces the archive-mode defaults server-side: only archived rows are deleted for good", async () => {
    expect(meta.rowScopeOf(archive)?.rowActions?.delete).to.deep.equal({
      isEnabled: true,
      rule: { field: "isArchived", equals: true },
    });
    expect(await deleteFrom(KEY_ARCHIVE, ALL_IDS)).to.equal(1);
    expect([...rows.keys()]).to.deep.equal(["low", "high", "legacy"]);
  });

  it("refuses a table key that names no table view with the action", async () => {
    const error = await rejectionOf(() =>
      deleteFrom("pages.unknown.table", ["low"]),
    );
    expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
    expect(rows.size).to.equal(ALL_IDS.length);
    // The archive table has no delete action of its own besides the default
    // one it declares; the free table has no archive action at all.
    expect(() => actionPermissionIds(meta, "archive", KEY_FREE)).to.throw();
  });

  it("holds a request naming its table to that table's permission alone", () => {
    expect(actionPermissionIds(meta, "delete", KEY_RULED)).to.deep.equal([
      `${KEY_RULED}.delete`,
    ]);
    expect(actionPermissionIds(meta, "delete", undefined)).to.have.members([
      `${KEY_RULED}.delete`,
      `${KEY_FREE}.delete`,
      `${KEY_ARCHIVE}.delete`,
    ]);
  });

  describe("a request naming no table", () => {
    it("acts through the tables whose action the caller holds", async () => {
      const onlyRuled = await resolveActingTableViews(
        meta,
        "delete",
        undefined,
        new Set([`${KEY_RULED}.delete`]),
      );
      expect(onlyRuled).to.deep.equal([ruled]);
      const named = await resolveActingTableViews(
        meta,
        "delete",
        KEY_FREE,
        new Set([`${KEY_RULED}.delete`]),
      );
      expect(named).to.deep.equal([free]);
    });

    it("lets a row through when one of those tables allows it", () => {
      const both = combineRowRules(undefined, [
        NOT_HIGH,
        { field: "x", equals: 1 },
      ]);
      expect(both).to.deep.equal({
        or: [NOT_HIGH, { field: "x", equals: 1 }],
      });
      // A table without a rule allows every row: nothing left to check.
      expect(combineRowRules(undefined, [NOT_HIGH, undefined])).to.equal(
        undefined,
      );
      // A controller-wide rule, set explicitly, applies on top.
      const wide = { field: "locked", notEquals: true } as const;
      expect(combineRowRules(wide, [NOT_HIGH])).to.deep.equal({
        and: [wide, NOT_HIGH],
      });
      expect(combineRowRules(wide, [])).to.deep.equal(wide);
    });

    it("applies only the rules every table it may use shares", async () => {
      // Without a key, every table view over the controller is a candidate:
      // the free table allows the high-priority row.
      expect(await deleteFrom(undefined, ["low", "high"])).to.equal(2);
    });
  });

  describe("archive field never written", () => {
    it("lists such a row among the active ones", async () => {
      const filters = await applyArchiveFilter(
        controller,
        { url: new URL("http://localhost/list?showArchived=false") } as never,
        undefined,
        new Set(["*"]),
        {},
      );
      // "not archived", which a missing field satisfies — "archived is
      // false" never matches it.
      expect(filters?.isArchived).to.deep.equal([true, "ne"]);
      const archived = await applyArchiveFilter(
        controller,
        { url: new URL("http://localhost/list?showArchived=true") } as never,
        undefined,
        new Set(["*"]),
        {},
      );
      expect(archived?.isArchived).to.deep.equal([true, "eq"]);
    });

    it("lets such a row be archived and edited, not restored or deleted for good", () => {
      const scope = meta.rowScopeOf(archive)?.rowActions;
      const ruleOf = (action: "archive" | "restore" | "delete" | "edit") => {
        const config = scope?.[action];
        if (typeof config !== "object" || !config?.rule) {
          throw new Error(`no ${action} rule`);
        }
        return config.rule;
      };
      const legacy = { _id: "legacy", priority: "low" };
      expect(evaluateRowActionRule(ruleOf("archive"), legacy)).to.equal(true);
      expect(evaluateRowActionRule(ruleOf("edit"), legacy)).to.equal(true);
      expect(evaluateRowActionRule(ruleOf("restore"), legacy)).to.equal(false);
      expect(evaluateRowActionRule(ruleOf("delete"), legacy)).to.equal(false);
    });
  });

  it("names the table on its edit form's submit URL", async () => {
    expect(
      appendTableViewKey("/api/task/edit?id={{params.id}}", KEY_FREE),
    ).to.equal(`/api/task/edit?id={{params.id}}&tableView=${KEY_FREE}`);
    expect(
      appendTableViewKey(`/api/task/edit?tableView=old&id=1`, KEY_FREE),
    ).to.equal(`/api/task/edit?tableView=${KEY_FREE}&id=1`);
    expect(appendTableViewKey("/api/task/new", KEY_FREE)).to.equal(
      `/api/task/new?tableView=${KEY_FREE}`,
    );
    const builder = free as ComponentBuilder<TableViewOptionsSerialized>;
    const { options } = builder.serializeSync();
    const filter = builder.onFilterCallback;
    if (!filter || !options) throw new Error("table view without a filter");
    const served = await filter(new Set(["*"]), options, KEY_FREE, {
      tenantId: "row-rules-tenant",
      user: undefined,
    });
    expect(served.tableViewKey).to.equal(KEY_FREE);
    // The free table's rows are not filtered by the conditional table's rule
    // on the frontend either.
    expect(served.rowActions?.delete).to.equal(true);
  });
});
