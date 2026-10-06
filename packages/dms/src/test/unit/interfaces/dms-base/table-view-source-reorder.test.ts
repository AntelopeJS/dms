import { Controller, type RequestContext } from "@antelopejs/interface-api";
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
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Column,
  TableView,
  type TableViewOptionsSerialized,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

const TABLE = "reorder-features";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Feature extends Table {
  @Field("string") declare name: string;
  @Field("number") declare position: number;
  @Field("number") declare votes: number;
  @Field("number") declare rank: number;
}

class FeatureModel extends BasicDataModel(Feature, TABLE) {}

@RegisterDataController()
class FeatureAPI extends DataController(
  Feature,
  { list: TableViewRoutes.List, edit: TableViewRoutes.Edit },
  Controller("/api/reorder-features"),
) {
  @ModelReference()
  @Model(FeatureModel)
  declare model: FeatureModel;

  @Listable()
  @Sortable()
  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  declare name: string;

  @Listable()
  @Sortable()
  @Column({ name: "Position", type: new DefaultDataTypes.NumberType() })
  declare position: number;

  @Listable()
  @Column({ name: "Votes", type: new DefaultDataTypes.NumberType() })
  declare votes: number;

  @Listable()
  @Sortable()
  @Column({ name: "Rank", type: new DefaultDataTypes.NumberType() })
  @Access(AccessMode.ReadOnly)
  declare rank: number;
}

type FeatureOptions = NonNullable<
  Parameters<typeof TableView<typeof FeatureAPI>>[1]
>;

const optionsOf = (options: FeatureOptions) =>
  TableView(FeatureAPI, { realtime: false, ...options }).serializeSync()
    .options as TableViewOptionsSerialized;

type SourceOptions = Parameters<typeof TableView.fromSource>[0];

const STRING = new DefaultDataTypes.StringType();

interface SourceColumnSerialized {
  id: string;
  enableSorting: boolean;
  enableColumnFilter: boolean;
}

// A source table carries the column metadata a controller would give it.
type SourceTableSerialized = TableViewOptionsSerialized & {
  columns: SourceColumnSerialized[];
};

const sourceOf = (options: Partial<SourceOptions> = {}) =>
  TableView.fromSource({
    fetchUrl: "/api/request-log",
    columns: {
      path: { name: "Path", type: STRING, order: 2, sortable: true },
      method: { name: "Method", type: STRING, order: 1, filterable: true },
    },
    ...options,
  }).serializeSync().options as SourceTableSerialized;

describe("[unit] interfaces/dms-base — table view sources and reorder", () => {
  it("serves a source table: its route, its columns in order, no built-in action", () => {
    const options = sourceOf({
      capabilities: { filter: true },
      pagination: "loadMore",
      rowIdKey: "requestId",
    });
    expect(options.source).to.deep.equal({
      fetchUrl: "/api/request-log",
      capabilities: { filter: true },
    });
    expect(options.columns.map((column) => column.id)).to.deep.equal([
      "method",
      "path",
    ]);
    expect(options.columns[0]?.enableColumnFilter).to.equal(true);
    expect(options.columns[1]?.enableSorting).to.equal(true);
    expect(options.searchable).to.equal(true);
    expect(options.pagination).to.equal("loadMore");
    expect(options.rowIdKey).to.equal("requestId");
    expect(options.rowActions).to.deep.include({
      add: false,
      edit: false,
      delete: false,
    });
    expect(options.realtime).to.equal(false);
  });

  it("searches and sorts a paging route's rows only where the route does", () => {
    const paged = sourceOf({ capabilities: { paginate: true } });
    expect(paged.searchable).to.equal(false);
    expect(paged.columns[1]?.enableSorting).to.equal(false);
    expect(paged.columns[0]?.enableColumnFilter).to.equal(false);
    const full = sourceOf({
      capabilities: { paginate: true, search: true, sort: true },
    });
    expect(full.searchable).to.equal(true);
    expect(full.columns[1]?.enableSorting).to.equal(true);
  });

  it("refuses tabs filtering a route that reads no filter, and unknown columns", () => {
    const tabs = [
      {
        id: "get",
        label: "GET",
        filter: { accessorKey: "method", mode: "is", value: "GET" },
      },
    ] as SourceOptions["tabs"];
    expect(() => sourceOf({ tabs })).to.throw(/needs capabilities\.filter/);
    expect(() =>
      sourceOf({ tabs, capabilities: { filter: true } }),
    ).to.not.throw();
    expect(() =>
      sourceOf({ capabilities: { filter: true }, labelKey: "status" }),
    ).to.throw(/unknown column "status"/);
  });

  it("runs the registration checks of TableView(): page size, displays, card fields, tab targets", () => {
    expect(() => sourceOf({ pageSize: 0 })).to.throw(/pageSize/);
    expect(() => sourceOf({ displays: [{ id: "plan-cards" }] })).to.throw(
      /named "<module>:<id>"/,
    );
    expect(() => sourceOf({ defaultDisplay: "cards" })).to.throw(
      /not declared in displays/,
    );
    expect(() => sourceOf({ card: { fields: ["status"] } })).to.throw(
      /unknown column "status"/,
    );
    const both = [
      {
        id: "get",
        label: "GET",
        to: "/elsewhere",
        filter: { accessorKey: "method", mode: "is", value: "GET" },
      },
    ] as SourceOptions["tabs"];
    expect(() =>
      sourceOf({ tabs: both, capabilities: { filter: true } }),
    ).to.throw(/both a filter and a link/);
  });

  it("serves the expandable band of a source's rows, refusing unknown fields", () => {
    expect(
      sourceOf({ expandable: { fields: ["path"] } }).expandable,
    ).to.deep.include({ fields: [{ key: "path" }] });
    expect(() => sourceOf({ expandable: { fields: ["status"] } })).to.throw(
      /unknown column "status"/,
    );
  });

  it("serves the reorder field and the pagination mode", () => {
    const options = optionsOf({
      reorder: { field: "position" },
      pagination: "infinite",
    });
    expect(options.reorder).to.deep.equal({ field: "position" });
    expect(options.pagination).to.equal("infinite");
  });

  it("refuses a reorder field the rows cannot be sorted on nor saved by", () => {
    expect(() => optionsOf({ reorder: { field: "name" } })).to.throw(
      /must be a NumberType column/,
    );
    expect(() => optionsOf({ reorder: { field: "votes" } })).to.throw(
      /must be @Sortable\(\)/,
    );
    expect(() => optionsOf({ reorder: { field: "rank" } })).to.throw(
      /must be writable/,
    );
    expect(() =>
      optionsOf({
        reorder: { field: "position" },
        rowActions: { edit: false },
      }),
    ).to.throw(/needs the edit action/);
  });

  it("types a guard's `this` as the data controller it runs with", async () => {
    const reached: FeatureModel[] = [];
    const guards: FeatureOptions["guards"] = {
      delete: function () {
        // Compiles only while `this` is typed as the controller.
        reached.push(this.model);
      },
    };
    const controller = new FeatureAPI();
    await guards?.delete?.call(controller, {} as RequestContext, { ids: [] });
    expect(reached).to.deep.equal([controller.model]);
  });
});
