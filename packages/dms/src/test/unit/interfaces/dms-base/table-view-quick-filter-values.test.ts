import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
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
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  TableView,
  type TableViewQuickFilter,
  TableViewRoutes,
  Column,
} from "@antelopejs/interface-dms/base/table-view";
import { captureWarnings } from "../../../helpers/logging";

const TABLE = "quick-filter-values-shops";
const NO_VALUES = "has no values to pick";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Shop extends Table {
  @Field("string") declare city: string;
  @Field("string") declare kind: string;
  @Field("string") declare tier: string;
  @Field("boolean") declare open: boolean;
}

class ShopModel extends BasicDataModel(Shop, TABLE) {}

@RegisterDataController()
class ShopAPI extends DataController(
  Shop,
  { list: TableViewRoutes.List },
  Controller("/api/quick-filter-values-shops"),
) {
  @ModelReference()
  @Model(ShopModel)
  declare model: ShopModel;

  @Listable()
  @Column({
    name: "City",
    type: new DefaultDataTypes.StringType(),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
  declare city: string;

  @Listable()
  @Column({
    name: "Kind",
    type: new DefaultDataTypes.SelectType({
      items: [{ value: "bakery", label: "Bakery" }],
    }),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
  declare kind: string;

  @Listable()
  @Column({
    name: "Tier",
    type: new DefaultDataTypes.SelectType({ items: [] }),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
  declare tier: string;

  @Listable()
  @Column({
    name: "Open",
    type: new DefaultDataTypes.BooleanType(),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
  declare open: boolean;
}

function quickFilterWarnings(register: () => void): string[] {
  const captured = captureWarnings();
  try {
    register();
  } finally {
    captured.restore();
  }
  return captured.messages.filter((message) => message.includes(NO_VALUES));
}

const registerOn = (fields: string[]) => () =>
  TableView(ShopAPI, {
    realtime: false,
    quickFilters: fields.map((field): TableViewQuickFilter => ({ field })),
  });

describe("[unit] interfaces/dms-base/table-view — quick filters need values to pick", () => {
  it("warns about a quick filter on a free-text column, once per table and field", () => {
    const warnings = quickFilterWarnings(() => {
      registerOn(["city"])();
      registerOn(["city"])();
    });
    expect(warnings).to.have.length(1);
    expect(warnings[0]).to.include('column "city" (string)');
    expect(warnings[0]).to.include("ShopAPI");
  });

  it("warns about a select without items", () => {
    const warnings = quickFilterWarnings(registerOn(["tier"]));
    expect(warnings).to.have.length(1);
    expect(warnings[0]).to.include('column "tier" (select)');
  });

  it("keeps quiet about a select with items and a boolean", () => {
    expect(quickFilterWarnings(registerOn(["kind", "open"]))).to.deep.equal([]);
  });

  it("still serves the quick filter it warns about", () => {
    let table: ReturnType<typeof TableView> | undefined;
    quickFilterWarnings(() => {
      table = registerOn(["city"])();
    });
    const options = table!.serializeSync().options as {
      quickFilters?: TableViewQuickFilter[];
    };
    expect(options.quickFilters).to.deep.equal([{ field: "city" }]);
  });

  it("warns about a source table's free-text quick filter too", () => {
    const warnings = quickFilterWarnings(() =>
      TableView.fromSource({
        fetchUrl: "/api/quick-filter-values-log",
        capabilities: { filter: true },
        columns: {
          path: {
            name: "Path",
            type: new DefaultDataTypes.StringType(),
            filterable: true,
          },
          method: {
            name: "Method",
            type: new DefaultDataTypes.SelectType({
              items: [{ value: "GET", label: "GET" }],
            }),
            filterable: true,
          },
        },
        quickFilters: [{ field: "path" }, { field: "method" }],
      }),
    );
    expect(warnings).to.have.length(1);
    expect(warnings[0]).to.include('column "path" (string)');
  });
});
