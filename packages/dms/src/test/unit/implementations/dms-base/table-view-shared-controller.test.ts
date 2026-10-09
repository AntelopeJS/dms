import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import { applyArchiveFilter } from "../../../../implementations/dms-base/search-route";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import type { ComponentBuilder } from "@antelopejs/interface-dms/component";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import {
  TableViewMeta,
  type TableViewOptionsSerialized,
} from "@antelopejs/interface-dms/base/table-view";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";

const ARCHIVE_FIELD = "archived";
const VIEW_ARCHIVED_ACTION = "viewArchived";
const ARCHIVING_TABLE_PERMISSION = "pages.shared.archiving.table.viewArchived";
const HTTP_FORBIDDEN = 403;

type TableViewBuilder = ComponentBuilder<TableViewOptionsSerialized>;

/** A builder whose actions are stamped with `permissionIds`, by action id. */
function stampedBuilder(
  permissionIds: Record<string, string> = {},
): TableViewBuilder {
  return {
    getAction: (actionId: string) =>
      permissionIds[actionId]
        ? { permissionId: permissionIds[actionId] }
        : undefined,
  } as unknown as TableViewBuilder;
}

function requestShowingArchived(): RequestContext {
  return {
    url: new URL("http://localhost/list?showArchived=true"),
  } as RequestContext;
}

async function rejectionOf(promise: Promise<unknown>): Promise<HTTPResult> {
  try {
    await promise;
  } catch (error) {
    expect(error).to.be.instanceOf(HTTPResult);
    return error as HTTPResult;
  }
  throw new Error("expected the archive filter to refuse");
}

describe("[unit] implementations/dms-base — data controller shared by several TableViews", () => {
  // Held here: the meta only keeps weak references to the builders.
  const builders: TableViewBuilder[] = [];

  function sharedController(...tableViews: TableViewBuilder[]): unknown {
    class Controller {}
    const meta = GetMetadata(Controller, TableViewMeta);
    meta.setArchiveField(ARCHIVE_FIELD);
    for (const builder of tableViews) {
      builders.push(builder);
      meta.addComponentBuilder(builder);
    }
    return new Controller();
  }

  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
  });

  it("keeps every TableView built on the controller", () => {
    const first = stampedBuilder();
    const last = stampedBuilder();
    const instance = sharedController(first, last);
    const meta = GetMetadata(
      (instance as { constructor: new () => unknown }).constructor,
      TableViewMeta,
    );
    expect(meta.componentBuilders).to.deep.equal([first, last]);
  });

  it("collects an action's permission from each TableView that stamps it", () => {
    const instance = sharedController(
      stampedBuilder({ add: "pages.a.table.add" }),
      stampedBuilder(),
      stampedBuilder({ add: "pages.b.table.add" }),
      stampedBuilder({ add: "pages.a.table.add" }),
    );
    const meta = GetMetadata(
      (instance as { constructor: new () => unknown }).constructor,
      TableViewMeta,
    );
    expect(meta.actionPermissionIds("add")).to.deep.equal([
      "pages.a.table.add",
      "pages.b.table.add",
    ]);
  });

  // The last TableView built carries no archive mode: reading only that one
  // used to leave the archived rows open to anyone.
  it("guards archived rows when only an earlier TableView declares viewArchived", async () => {
    const instance = sharedController(
      stampedBuilder({ [VIEW_ARCHIVED_ACTION]: ARCHIVING_TABLE_PERMISSION }),
      stampedBuilder(),
    );
    const error = await rejectionOf(
      applyArchiveFilter(
        instance,
        requestShowingArchived(),
        undefined,
        new Set<string>(),
        {},
      ),
    );
    expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
  });

  it("shows archived rows to a holder of any TableView's viewArchived", async () => {
    const instance = sharedController(
      stampedBuilder({ [VIEW_ARCHIVED_ACTION]: ARCHIVING_TABLE_PERMISSION }),
      stampedBuilder({
        [VIEW_ARCHIVED_ACTION]: "pages.shared.other.table.viewArchived",
      }),
    );
    const filters = await applyArchiveFilter(
      instance,
      requestShowingArchived(),
      undefined,
      new Set(withPermissionAncestors([ARCHIVING_TABLE_PERMISSION])),
      {},
    );
    expect(filters).to.have.property(ARCHIVE_FIELD);
  });
});
