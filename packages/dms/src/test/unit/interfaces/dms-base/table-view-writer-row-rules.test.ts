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
import { createValidatedRoute } from "@antelopejs/interface-dms/base/table-view/internal/row-rules";
import type { ComponentBuilder } from "@antelopejs/interface-dms/component";

import { tableViewAccess } from "@antelopejs/interface-dms/base/table-view/internal/writer";

// Several table views may mount one controller, but only one of them writes:
// its rules, archive-mode defaults included, are the ones the data routes
// enforce, and its permission is the one that guards them. A read-only table
// view sharing the controller changes neither.

const SCHEMA = "writer-row-rules-test";
const TABLE = "tasks";
const KEY_WRITER = "pages.archive.table";
const KEY_READER = "pages.overview.table";
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
  Controller("/api/writer-row-rules"),
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

// "archived" is the only row archived; "legacy" was created before the
// archive field existed.
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

const writer = TableView(SharedTaskAPI, {
  realtime: false,
  archiveMode: true,
  rowActions: { archive: true, restore: true, hasSelection: true },
});
// Built last: the table view the controller used to take its options from.
const reader = TableView(SharedTaskAPI, {
  realtime: false,
  rowActions: { add: false, duplicate: false, edit: false, delete: false },
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

const REQUEST = {
  url: new URL("http://localhost/api/writer-row-rules/delete"),
} as RequestContext;

function deleteRows(ids: string[]) {
  return remove.func.call(controller, REQUEST, { id: ids });
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

function ruleOf(action: "archive" | "restore" | "delete" | "edit") {
  const config = meta.controllerRowActionRules?.[action];
  if (typeof config !== "object" || !config?.rule) {
    throw new Error(`no ${action} rule`);
  }
  return config.rule;
}

async function served(
  builder: ComponentBuilder<TableViewOptionsSerialized>,
  permissionId: string,
) {
  const { options } = builder.serializeSync();
  const filter = builder.onFilterCallback;
  if (!filter || !options) throw new Error("table view without a filter");
  return filter(new Set(["*"]), options, permissionId, {
    tenantId: "writer-row-rules-tenant",
    user: undefined,
  });
}

describe("[unit] TableView row rules are those of the controller's writing table view", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(
      { validateRowsAgainstRule },
      { validateRowsAgainstRule: tableViewImpl.validateRowsAgainstRule },
    );
    permissionMap.set(writer, KEY_WRITER);
    permissionMap.set(reader, KEY_READER);
  });

  beforeEach(() => {
    rows = createRows();
    controller.model = { table: createTable(rows) } as never;
  });

  after(() => {
    for (const builder of [writer, reader]) permissionMap.delete(builder);
  });

  it("tells a writing table view from a read-only one", () => {
    expect(meta.writingComponentBuilders).to.deep.equal([writer]);
    expect(meta.componentBuilders).to.include.members([writer, reader]);
  });

  it("takes the writing table view's rules, archive-mode defaults included", () => {
    expect(meta.controllerRowActionRules?.delete).to.deep.equal({
      isEnabled: true,
      rule: { field: "isArchived", equals: true },
    });
  });

  it("keeps the writing table view's options when a read-only one is built after it", () => {
    expect(meta.options.archiveMode).to.equal(true);
  });

  it("enforces the archive-mode defaults server-side: only archived rows are deleted for good", async () => {
    expect(await deleteRows(ALL_IDS)).to.equal(1);
    expect([...rows.keys()]).to.deep.equal(["low", "high", "legacy"]);
  });

  it("refuses an edit the writing table view's rule refuses", async () => {
    const error = await rejectionOf(() =>
      edit.func.call(controller, REQUEST, { id: "archived" }),
    );
    expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
    expect(
      await edit.func.call(controller, REQUEST, { id: "low" }),
    ).to.deep.equal({ edited: true });
  });

  it("guards writes with the writing table view's permission, reads with every one's", () => {
    expect(meta.actionPermissionIds("delete")).to.deep.equal([
      `${KEY_WRITER}.delete`,
    ]);
    expect(meta.actionPermissionIds("edit")).to.deep.equal([
      `${KEY_WRITER}.edit`,
    ]);
    expect(meta.actionPermissionIds("list")).to.have.members([
      `${KEY_WRITER}.list`,
      `${KEY_READER}.list`,
    ]);
  });

  it("opens no submitting form on a read-only table view", async () => {
    const { formComponents } = await served(reader, KEY_READER);
    expect(formComponents.new).to.equal(undefined);
    expect(formComponents.edit).to.equal(undefined);
    expect(formComponents.view).to.not.equal(undefined);
    expect(meta.writingComponents).to.not.include(reader);
    expect(meta.writingComponents).to.include(writer);
  });

  it("serves each table view its own row actions", async () => {
    expect((await served(reader, KEY_READER)).rowActions?.delete).to.equal(
      false,
    );
    expect((await served(writer, KEY_WRITER)).rowActions?.delete).to.deep.equal(
      { isEnabled: true, rule: { field: "isArchived", equals: true } },
    );
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
      const legacy = { _id: "legacy", priority: "low" };
      expect(evaluateRowActionRule(ruleOf("archive"), legacy)).to.equal(true);
      expect(evaluateRowActionRule(ruleOf("edit"), legacy)).to.equal(true);
      expect(evaluateRowActionRule(ruleOf("restore"), legacy)).to.equal(false);
      expect(evaluateRowActionRule(ruleOf("delete"), legacy)).to.equal(false);
    });
  });
});

describe("[unit] tableViewAccess", () => {
  const OFFERS_ALL = {
    hasNewForm: true,
    hasEditForm: true,
    hasDeleteEndpoint: true,
    archiveMode: false,
  };
  const READ_ONLY = {
    add: false,
    duplicate: false,
    edit: false,
    delete: false,
  } as const;

  it("writes when an action left at its default can change a row", () => {
    expect(tableViewAccess(undefined, OFFERS_ALL)).to.equal("write");
    expect(
      tableViewAccess({ ...READ_ONLY, duplicate: true }, OFFERS_ALL),
    ).to.equal("write");
    expect(
      tableViewAccess(
        { ...READ_ONLY, edit: { rule: { field: "x", equals: 1 } } },
        OFFERS_ALL,
      ),
    ).to.equal("write");
  });

  it("reads only when every write action is turned off", () => {
    expect(tableViewAccess(READ_ONLY, OFFERS_ALL)).to.equal("read");
    expect(
      tableViewAccess({ ...READ_ONLY, edit: { isEnabled: false } }, OFFERS_ALL),
    ).to.equal("read");
  });

  it("reads only when the controller offers nothing to write", () => {
    expect(
      tableViewAccess(undefined, {
        hasNewForm: false,
        hasEditForm: false,
        hasDeleteEndpoint: false,
        archiveMode: false,
      }),
    ).to.equal("read");
  });

  it("counts archive and restore in archive mode only", () => {
    const archiving = { ...OFFERS_ALL, archiveMode: true };
    expect(tableViewAccess(READ_ONLY, archiving)).to.equal("write");
    expect(
      tableViewAccess(
        { ...READ_ONLY, archive: false, restore: false },
        archiving,
      ),
    ).to.equal("read");
  });
});
