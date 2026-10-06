import { Controller, type ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import * as pageImpl from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import * as pageInterface from "@antelopejs/interface-dms/page";
import {
  PageMetadata,
  RootPageController,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Column,
  TableView,
  type TableViewOptionsSerialized,
  TableViewRoutes,
  tableViewLink,
} from "@antelopejs/interface-dms/base/table-view";
import { resolveTableViewViews } from "@antelopejs/interface-dms/base/table-view/internal/views";
import { withTableViewPlacements } from "@antelopejs/interface-dms/page/table-view-ids";
import type { ComponentInfoSerialized } from "@antelopejs/interface-dms/component";

const TABLE = "views-tickets";
const LOCATION = "/api/views-tickets";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Ticket extends Table {
  @Field("string") declare title: string;
  @Field("string") declare status: string;
  @Field("string") declare owner: string;
  @Field("date") declare createdAt: Date;
}

class TicketModel extends BasicDataModel(Ticket, TABLE) {}

@RegisterDataController()
class TicketAPI extends DataController(
  Ticket,
  { list: TableViewRoutes.List, countBatch: TableViewRoutes.CountBatch },
  Controller(LOCATION),
) {
  @ModelReference()
  @Model(TicketModel)
  declare model: TicketModel;

  @Listable()
  @Sortable()
  @Column({ name: "Title", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare title: string;

  @Listable()
  @Sortable()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.SelectType({ items: [] }),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
  declare status: string;

  @Listable()
  @Column({ name: "Owner", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare owner: string;

  @Listable()
  @Sortable()
  @Column({ name: "Created", type: new DefaultDataTypes.DateType() })
  @Access(AccessMode.ReadOnly)
  declare createdAt: Date;
}

type TicketOptions = NonNullable<
  Parameters<typeof TableView<typeof TicketAPI>>[1]
>;

const READ_ONLY = { add: false, duplicate: false, edit: false, delete: false };

const tableOptions = (options: TicketOptions): TableViewOptionsSerialized =>
  TableView(TicketAPI, {
    realtime: false,
    rowActions: READ_ONLY,
    ...options,
  }).serializeSync().options as TableViewOptionsSerialized;

const register = (options: TicketOptions) => () =>
  TableView(TicketAPI, { realtime: false, rowActions: READ_ONLY, ...options });

describe("[unit] interfaces/dms-base — table view views", () => {
  it("serializes the views without their permission", () => {
    const options = tableOptions({
      views: {
        layout: "strip",
        defaultView: "open",
        userViews: true,
        items: [
          {
            id: "open",
            label: "Open",
            filters: [{ accessorKey: "status", mode: "is", value: "open" }],
            sort: [{ field: "createdAt", desc: true }],
            count: true,
            permission: "tickets.audit",
          },
        ],
      },
    });
    expect(options.views).to.deep.equal({
      layout: "strip",
      defaultView: "open",
      userViews: true,
      items: [
        {
          id: "open",
          label: "Open",
          filters: [{ accessorKey: "status", mode: "is", value: "open" }],
          sort: [{ field: "createdAt", desc: true }],
          count: true,
        },
      ],
    });
  });

  it("serves a view only to a caller holding its permission, dropping a default it left out", async () => {
    const declared = {
      defaultView: "audit",
      items: [
        { id: "all", label: "All" },
        { id: "audit", label: "Audit", permission: "audit" },
        { id: "ledger", label: "Ledger", permissionId: "ledger.read" },
      ],
    };
    const serialized = {
      defaultView: "audit",
      items: [
        { id: "all", label: "All" },
        { id: "audit", label: "Audit" },
        { id: "ledger", label: "Ledger" },
      ],
    };
    const refused = await resolveTableViewViews(
      new Set(),
      declared,
      serialized,
      "tickets",
    );
    expect(refused?.items.map((view) => view.id)).to.deep.equal(["all"]);
    expect(refused?.defaultView).to.equal(undefined);
    const granted = await resolveTableViewViews(
      new Set(["tickets.audit", "ledger.read"]),
      declared,
      serialized,
      "tickets",
    );
    expect(granted?.items.map((view) => view.id)).to.deep.equal([
      "all",
      "audit",
      "ledger",
    ]);
    expect(granted?.defaultView).to.equal("audit");
  });

  it("refuses two views under one id", () => {
    expect(
      register({
        views: {
          items: [
            { id: "mine", label: "Mine" },
            { id: "mine", label: "Mine again" },
          ],
        },
      }),
    ).to.throw(/declared twice/);
  });

  it("refuses a default view that is not declared", () => {
    expect(
      register({
        views: { defaultView: "gone", items: [{ id: "a", label: "A" }] },
      }),
    ).to.throw(/defaults to view "gone"/);
  });

  it("refuses a view filtering on a column that is not filterable", () => {
    expect(
      register({
        views: {
          items: [
            {
              id: "mine",
              label: "Mine",
              filters: [
                { accessorKey: "owner", mode: "is", value: "{{user.id}}" },
              ],
            },
          ],
        },
      }),
    ).to.throw(/"owner", which is not a filterable column/);
  });

  it("refuses a view sorting on a column that is not sortable", () => {
    expect(
      register({
        views: { items: [{ id: "a", label: "A", sort: [{ field: "owner" }] }] },
      }),
    ).to.throw(/"owner", which is not a @Sortable\(\) column/);
  });

  it("refuses a view naming an unknown column or a display the table does not offer", () => {
    expect(
      register({
        views: {
          items: [{ id: "a", label: "A", columns: { hidden: ["nope"] } }],
        },
      }),
    ).to.throw(/unknown column "nope"/);
    expect(
      register({
        views: { items: [{ id: "a", label: "A", display: "grouped" }] },
      }),
    ).to.throw(/opens display "grouped", which the table does not offer/);
  });

  it("offers the grouped display as a display entry a view may open", () => {
    const options = tableOptions({
      grouped: { groupByField: "createdAt", by: "day", count: true },
      defaultDisplay: "grouped",
      views: { items: [{ id: "a", label: "A", display: "grouped" }] },
    });
    expect(options.displays).to.deep.equal([
      {
        id: "grouped",
        options: { groupByField: "createdAt", by: "day", count: true },
      },
    ]);
    expect(options.defaultDisplay).to.equal("grouped");
  });

  it("refuses to group on an unknown, unsortable or (by day) non-date column", () => {
    expect(register({ grouped: { groupByField: "nope" } })).to.throw(
      /unknown column "nope"/,
    );
    expect(register({ grouped: { groupByField: "owner" } })).to.throw(
      /must be @Sortable\(\)/,
    );
    expect(
      register({ grouped: { groupByField: "status", by: "week" } }),
    ).to.throw(/needs a DateType column/);
  });
});

describe("[unit] interfaces/dms-base — table view links and URL keys", () => {
  let page: ControllerClass;
  let meta: PageMetadata;

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(pageInterface, pageImpl);
    class TicketsPage extends RootPageController("views-tickets-page", {
      displayName: "Tickets",
    }) {}
    page = TicketsPage as ControllerClass;
    meta = GetMetadata(page, PageMetadata);
    meta.SetComponent(
      "content",
      TableView(TicketAPI, { realtime: false, rowActions: READ_ONLY }),
    );
    await meta.Register();
  });

  after(() => meta.Dispose());

  it("links a page to one of its table's views or tabs", () => {
    expect(tableViewLink(page, "content", { view: "past-due" })).to.equal(
      "/views-tickets-page?content.view=past-due",
    );
    expect(
      tableViewLink(page, "content", { view: "mine", tab: "open" }),
    ).to.equal("/views-tickets-page?content.view=mine&content.tab=open");
  });

  it("refuses to link a controller that is no page", () => {
    class NotAPage {}
    expect(() =>
      tableViewLink(NotAPage as ControllerClass, "content", { view: "a" }),
    ).to.throw(/is no page/);
  });

  it("tells each served table view its key and whether it is alone on its page", () => {
    const table: ComponentInfoSerialized = {
      componentName: "dms-table-view",
      options: { caption: "Tickets" },
    };
    const sole = withTableViewPlacements({ content: table });
    expect(sole.content?.options).to.deep.equal({
      caption: "Tickets",
      tableId: "content",
      isSoleTableView: true,
    });

    const shared = withTableViewPlacements({
      content: table,
      side: {
        componentName: "dms-grid",
        children: [{ id: "archive", component: table }],
      },
    });
    expect(shared.content?.options).to.include({
      tableId: "content",
      isSoleTableView: false,
    });
    expect(shared.side?.children?.[0]?.component.options).to.include({
      tableId: "archive",
      isSoleTableView: false,
    });
  });
});
