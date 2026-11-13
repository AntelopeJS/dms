import {
  computeParameter,
  Controller,
  ControllerMeta,
  type RequestContext,
} from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { DataController } from "@antelopejs/interface-data-api";
import { ModelReference } from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { Schema } from "@antelopejs/interface-database";
import { expect } from "chai";
import { z } from "zod";
import * as tableViewImpl from "../../../../implementations/dms-base/table-view";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
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
import { isFunction } from "@antelopejs/interface-dms/utils/internal/type-check";
import { userFixture } from "../../../helpers/user-fixture";
import { requestContextFixture } from "../../../helpers/request-context";

const SCHEMA = "bulk-operations-test";
const TABLE = "tasks";
const ARCHIVE_FIELD = "isArchived";
const IDS_ARG_INDEX = 1;
const SESSION = "bulk-operations-session";
const USER = userFixture({ _id: "bulk-operations-user" });
const ALL_IDS = ["a", "b", "c", "d"];

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

function context(query: string): RequestContext {
  return requestContextFixture(
    new URL(`http://localhost/api/bulk-operations/archive?${query}`),
  );
}

const controller = new TaskAPI();
const meta = GetMetadata(TaskAPI, TableViewMeta);
const published: string[][] = [];

/** Replaces the stored tasks with one per id of `ALL_IDS`, all `isArchived`. */
async function useRows(isArchived: boolean): Promise<void> {
  await controller.model.table.delete().run();
  await controller.model.insert(
    ALL_IDS.map((id) => ({
      _id: id,
      priority: id === RULE_REFUSED_ID ? "high" : "low",
      isArchived,
    })),
  );
}

async function storedIds(): Promise<string[]> {
  return (await controller.model.getAll()).map((row) => row._id).sort();
}

const ArchiveAnswer = z
  .object({ success: z.literal(true), archivedCount: z.number() })
  .strict();
const RestoreAnswer = z
  .object({ success: z.literal(true), restoredCount: z.number() })
  .strict();
const DeleteAnswer = z.union([
  z.number(),
  z.object({ deleted: z.number() }).strict(),
]);

async function archive(ids: string[]) {
  return ArchiveAnswer.parse(
    await TableViewRoutes.Archive.func.call(
      controller,
      context(""),
      ids,
      Buffer.alloc(0),
      USER,
      context(""),
      SESSION,
      USER,
    ),
  );
}

async function restore(ids: string[]) {
  return RestoreAnswer.parse(
    await TableViewRoutes.Restore.func.call(
      controller,
      context(""),
      ids,
      Buffer.alloc(0),
      USER,
      context(""),
      SESSION,
      USER,
    ),
  );
}

async function remove(ids: string[]) {
  return DeleteAnswer.parse(
    await TableViewRoutes.Delete.func.call(
      controller,
      context(""),
      { id: ids },
      Buffer.alloc(0),
      USER,
      context(""),
      SESSION,
      USER,
    ),
  );
}

async function archivedIds(): Promise<string[]> {
  return (await controller.model.getAll())
    .filter((row) => row.isArchived)
    .map((row) => row._id)
    .sort();
}

describe("[unit] TableView bulk operations", () => {
  before(async () => {
    await RegisterSchema(SCHEMA);
    const schema = Schema.get(SCHEMA);
    if (!schema) throw new Error("Missing test schema");
    controller.model = new TaskModel(schema.instance());
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
  });

  beforeEach(() => {
    published.length = 0;
    meta.controllerRowActionRules = undefined;
  });

  after(() => {
    meta.controllerRowActionRules = undefined;
    tenantAccess.internal.RegisterTenantAccessGate.unregister(gate);
    ImplementInterface(
      { internal: tableViewInternal },
      { internal: tableViewImpl.internal },
    );
  });

  it("reads every id of the repeated query key", async () => {
    class Probe extends Controller("/probe") {}
    for (const route of ["archive", "restore"] as const) {
      const callback =
        TableViewRoutes[route === "archive" ? "Archive" : "Restore"];
      const decorate = callback.args[IDS_ARG_INDEX];
      if (!isFunction(decorate)) {
        throw new Error(`${route} has no single ids decorator`);
      }
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
    await useRows(false);
    expect(await archive(["a", "b", "d"])).to.deep.equal({
      success: true,
      archivedCount: 3,
    });
    expect(await archivedIds()).to.deep.equal(["a", "b", "d"]);
    expect(published).to.deep.equal([["a", "b", "d"]]);

    expect(await restore(["a", "b", "d"])).to.deep.equal({
      success: true,
      restoredCount: 3,
    });
    expect(await archivedIds()).to.deep.equal([]);
  });

  it("leaves out only the rows the archive and restore rules refuse", async () => {
    meta.setControllerRowActionRules({
      archive: { isEnabled: true, rule: NOT_HIGH },
      restore: { isEnabled: true, rule: NOT_HIGH },
    });
    await useRows(false);
    expect(await archive(ALL_IDS)).to.deep.equal({
      success: true,
      archivedCount: 3,
    });
    expect(await archivedIds()).to.deep.equal(["a", "b", "d"]);

    await useRows(true);
    expect(await restore(ALL_IDS)).to.deep.equal({
      success: true,
      restoredCount: 3,
    });
    expect(await archivedIds()).to.deep.equal([RULE_REFUSED_ID]);
  });

  it("answers a zero count when the rule refuses every row", async () => {
    meta.setControllerRowActionRules({
      archive: { isEnabled: true, rule: NOT_HIGH },
    });
    await useRows(false);
    expect(await archive([RULE_REFUSED_ID])).to.deep.equal({
      success: true,
      archivedCount: 0,
    });
    expect(await archivedIds()).to.deep.equal([]);
  });

  it("counts only the rows that exist", async () => {
    await useRows(false);
    expect(await archive(["a", "missing"])).to.deep.equal({
      success: true,
      archivedCount: 1,
    });
  });

  it("deletes every selected row the delete rule allows", async () => {
    await useRows(false);
    expect(await remove(["a", "b", "d"])).to.equal(3);
    expect(await storedIds()).to.deep.equal([RULE_REFUSED_ID]);

    meta.setControllerRowActionRules({
      delete: { isEnabled: true, rule: NOT_HIGH },
    });
    await useRows(false);
    expect(await remove(ALL_IDS)).to.equal(3);
    expect(await storedIds()).to.deep.equal([RULE_REFUSED_ID]);
    expect(await remove([RULE_REFUSED_ID])).to.deep.equal({ deleted: 0 });
  });
});
