import {
  computeParameter,
  Controller,
  ControllerMeta,
  type RequestContext,
} from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { DataController } from "@antelopejs/interface-data-api";
import { Query } from "@antelopejs/interface-data-api/components";
import { ModelReference } from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import * as tableViewImpl from "../../../../implementations/dms-base/table-view";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  archiveRows,
  internal as tableViewInternal,
  type RealtimeMutationContext,
  restoreRows,
  TableViewMeta,
  validateRowsAgainstRule,
} from "@antelopejs/interface-dms/base/table-view";
import { TableViewRoutes } from "@antelopejs/interface-dms/base/table-view/routes";
import * as tenantAccess from "@antelopejs/interface-dms/tenant-access";

// A bulk action (archive, restore, delete) acts on every selected row: the
// ids arrive as a repeated query key, each one is checked against the row
// rule, and only the rows the rule refuses are left out.

const SCHEMA = "bulk-operations-test";
const TABLE = "tasks";
const ARCHIVE_FIELD = "isArchived";
const IDS_ARG_INDEX = 1;
const SESSION = "bulk-operations-session";
const USER = { _id: "bulk-operations-user" } as User;
const ALL_IDS = ["a", "b", "c", "d"];
// "c" is high priority: the rule below refuses it.
const RULE_REFUSED_ID = "c";
const NOT_HIGH = { field: "priority", notEquals: "high" } as const;
const gate: tenantAccess.TenantAccessGateInfo = {
  id: "bulk-operations-gate",
  order: 0,
  gate: () => ({ allowed: true }),
};

@RegisterTable(TABLE, SCHEMA)
class Task extends Table {
  @Field("string")
  declare priority: string;
  @Field("boolean")
  declare isArchived: boolean;
}
class TaskModel extends BasicDataModel(Task, TABLE) {}

class TaskAPI extends DataController(
  Task,
  {
    archive: TableViewRoutes.Archive,
    restore: TableViewRoutes.Restore,
    delete: TableViewRoutes.Delete,
  },
  Controller("/api/bulk-operations"),
) {
  @ModelReference()
  @Model(TaskModel)
  declare model: TaskModel;
}

type Row = { _id: string; priority: string; isArchived: boolean };

// The selection queries the routes run, over rows kept in memory: awaiting it
// reads the rows, `update` and `delete` answer the number of rows they reached
// as the database does.
function createTable(rows: Map<string, Row>) {
  return {
    getAll(ids: string[]) {
      const found = ids
        .map((id) => rows.get(id))
        .filter((row): row is Row => !!row);
      return Object.assign(Promise.resolve(found), {
        update: async (patch: Partial<Row>) => {
          for (const row of found) Object.assign(row, patch);
          return found.length;
        },
        delete: async () => {
          for (const row of found) rows.delete(row._id);
          return found.length;
        },
      });
    },
  };
}

function createRows(isArchived: boolean): Map<string, Row> {
  return new Map(
    ALL_IDS.map((id) => [
      id,
      {
        _id: id,
        priority: id === RULE_REFUSED_ID ? "high" : "low",
        isArchived,
      },
    ]),
  );
}

function context(query: string): RequestContext {
  return {
    url: new URL(`http://localhost/api/bulk-operations/archive?${query}`),
  } as RequestContext;
}

const controller = new TaskAPI();
const meta = GetMetadata(TaskAPI, TableViewMeta);
const published: string[][] = [];
let rows: Map<string, Row>;

function useRows(next: Map<string, Row>) {
  rows = next;
  // Only `table` is read by the routes under test.
  controller.model = { table: createTable(rows) } as never;
}

function archive(ids: string[]) {
  return TableViewRoutes.Archive.func.call(
    controller,
    context(""),
    ids,
    USER,
    SESSION,
    USER,
  );
}

function restore(ids: string[]) {
  return TableViewRoutes.Restore.func.call(
    controller,
    context(""),
    ids,
    USER,
    SESSION,
    USER,
  );
}

function remove(ids: string[]) {
  return TableViewRoutes.Delete.func.call(
    controller,
    context(""),
    { id: ids },
    USER,
    SESSION,
    USER,
  );
}

const archivedIds = () =>
  [...rows.values()].filter((row) => row.isArchived).map((row) => row._id);

describe("[unit] TableView bulk operations", () => {
  const originalDelete = Query.Delete;

  before(() => {
    void ImplementInterface(tenantAccess, tenantAccessImpl);
    tenantAccess.RegisterTenantAccessGate(gate);
    ImplementInterface(
      { archiveRows, restoreRows, validateRowsAgainstRule },
      {
        archiveRows: tableViewImpl.archiveRows,
        restoreRows: tableViewImpl.restoreRows,
        validateRowsAgainstRule: tableViewImpl.validateRowsAgainstRule,
      },
    );
    ImplementInterface(
      { internal: tableViewInternal },
      {
        internal: {
          PublishMutation: async ({ ids }: RealtimeMutationContext) => {
            published.push(ids);
          },
          AcquirePresence: async () => undefined,
        },
      },
    );
    meta.setArchiveField(ARCHIVE_FIELD);
    // The routes of DefaultRoutes.Delete reach the table through Query.Delete.
    Query.Delete = (_table, id) =>
      createTable(rows)
        .getAll(Array.isArray(id) ? id : [id])
        .delete() as never;
  });

  beforeEach(() => {
    published.length = 0;
    meta.controllerRowActionRules = undefined;
  });

  after(() => {
    Query.Delete = originalDelete;
    meta.controllerRowActionRules = undefined;
    tenantAccess.internal.RegisterTenantAccessGate.unregister(gate);
    ImplementInterface(
      { internal: tableViewInternal },
      { internal: tableViewImpl.internal },
    );
  });

  it("reads every id of the repeated query key", async () => {
    class Probe extends Controller("/probe") {}
    type ArgDecorator = (target: Probe, key: string, index: number) => void;
    for (const route of ["archive", "restore"] as const) {
      const callback =
        TableViewRoutes[route === "archive" ? "Archive" : "Restore"];
      const decorate = callback.args[IDS_ARG_INDEX] as ArgDecorator;
      decorate(Probe.prototype, route, IDS_ARG_INDEX);
      const parameter = GetMetadata(Probe, ControllerMeta).getParameterArray(
        route,
      )[IDS_ARG_INDEX];
      const ids = await computeParameter(
        context("ids=a&ids=b&ids=c"),
        parameter ?? null,
        controller,
      );
      expect(ids).to.deep.equal(["a", "b", "c"]);
    }
  });

  it("archives and restores every selected row", async () => {
    useRows(createRows(false));
    expect(await archive(["a", "b", "d"])).to.deep.equal({
      success: true,
      archivedCount: 3,
    });
    expect(archivedIds()).to.deep.equal(["a", "b", "d"]);
    expect(published).to.deep.equal([["a", "b", "d"]]);

    expect(await restore(["a", "b", "d"])).to.deep.equal({
      success: true,
      restoredCount: 3,
    });
    expect(archivedIds()).to.deep.equal([]);
  });

  it("leaves out only the rows the archive and restore rules refuse", async () => {
    meta.setControllerRowActionRules({
      archive: { isEnabled: true, rule: NOT_HIGH },
      restore: { isEnabled: true, rule: NOT_HIGH },
    });
    useRows(createRows(false));
    expect(await archive(ALL_IDS)).to.deep.equal({
      success: true,
      archivedCount: 3,
    });
    expect(archivedIds()).to.deep.equal(["a", "b", "d"]);

    useRows(createRows(true));
    expect(await restore(ALL_IDS)).to.deep.equal({
      success: true,
      restoredCount: 3,
    });
    expect(archivedIds()).to.deep.equal([RULE_REFUSED_ID]);
  });

  it("answers a zero count when the rule refuses every row", async () => {
    meta.setControllerRowActionRules({
      archive: { isEnabled: true, rule: NOT_HIGH },
    });
    useRows(createRows(false));
    expect(await archive([RULE_REFUSED_ID])).to.deep.equal({
      success: true,
      archivedCount: 0,
    });
    expect(archivedIds()).to.deep.equal([]);
  });

  it("counts only the rows that exist", async () => {
    useRows(createRows(false));
    expect(await archive(["a", "missing"])).to.deep.equal({
      success: true,
      archivedCount: 1,
    });
  });

  it("deletes every selected row the delete rule allows", async () => {
    useRows(createRows(false));
    expect(await remove(["a", "b", "d"])).to.equal(3);
    expect([...rows.keys()]).to.deep.equal([RULE_REFUSED_ID]);

    meta.setControllerRowActionRules({
      delete: { isEnabled: true, rule: NOT_HIGH },
    });
    useRows(createRows(false));
    expect(await remove(ALL_IDS)).to.equal(3);
    expect([...rows.keys()]).to.deep.equal([RULE_REFUSED_ID]);
    expect(await remove([RULE_REFUSED_ID])).to.deep.equal({ deleted: 0 });
  });
});
