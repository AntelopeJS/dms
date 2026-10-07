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
import { GetMetadata } from "@antelopejs/interface-core";
import { expect } from "chai";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import {
  Column,
  TableView,
  TableViewMeta,
  type TableViewOptionsSerialized,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

const TABLE = "footer-payments";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Payment extends Table {
  @Field("string") declare status: string;
  @Field("number") declare amount: number;
  @Field("string") declare note: string;
}

class PaymentModel extends BasicDataModel(Payment, TABLE) {}

@RegisterDataController()
class PaymentAPI extends DataController(
  Payment,
  { list: TableViewRoutes.List, summary: TableViewRoutes.Summary },
  Controller("/api/footer-payments"),
) {
  @ModelReference()
  @Model(PaymentModel)
  declare model: PaymentModel;

  @Listable()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.SelectType({
      items: [{ value: "failed", label: "Failed" }],
    }),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
  declare status: string;

  @Listable()
  @Column({ name: "Amount", type: new DefaultDataTypes.PriceType() })
  @Access(AccessMode.ReadOnly)
  declare amount: number;

  @Listable()
  @Column({ name: "Note", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare note: string;
}

type PaymentOptions = NonNullable<
  Parameters<typeof TableView<typeof PaymentAPI>>[1]
>;

const READ_ONLY = { add: false, duplicate: false, edit: false, delete: false };

const optionsOf = (options: PaymentOptions) =>
  TableView(PaymentAPI, {
    realtime: false,
    rowActions: READ_ONLY,
    ...options,
  }).serializeSync().options as TableViewOptionsSerialized;

describe("[unit] interfaces/dms-base — table view footer and empty states", () => {
  it("serves the summaries by id, keeping their rule on the server", () => {
    const options = optionsOf({
      footer: {
        countLabel: "$payments.count",
        legend: "status",
        summary: [
          { label: "Total", field: "amount", op: "sum" },
          {
            label: "Failed",
            op: "count",
            where: { field: "status", equals: "failed" },
            format: { notation: "compact" },
          },
        ],
      },
    });
    const [total, failed] = options.footer!.summary!;
    expect(options.footer?.countLabel).to.equal("$payments.count");
    expect(total).to.deep.include({
      label: "Total",
      field: "amount",
      op: "sum",
    });
    expect(failed).to.not.have.property("where");
    expect(failed?.format).to.deep.equal({ notation: "compact" });
    const meta = GetMetadata(PaymentAPI, TableViewMeta);
    expect(meta.footerSummary(failed!.id)?.where).to.deep.equal({
      field: "status",
      equals: "failed",
    });
    expect(meta.footerSummary("nope")).to.equal(undefined);
  });

  it("refuses a sum without a field, an unknown column, and a legend that is no select", () => {
    expect(() =>
      optionsOf({ footer: { summary: [{ label: "Sum", op: "sum" }] } }),
    ).to.throw(/sums no field/);
    expect(() =>
      optionsOf({
        footer: {
          summary: [
            {
              label: "Bad",
              op: "count",
              where: { not: { field: "nope" as "note", equals: "x" } },
            },
          ],
        },
      }),
    ).to.throw(/unknown column "nope"/);
    expect(() => optionsOf({ footer: { legend: "note" } })).to.throw(
      /must name a SelectType column/,
    );
  });

  it("serializes the empty states, a component included", () => {
    const options = optionsOf({
      emptyStates: {
        firstRun: {
          title: "$payments.empty.title",
          actions: [{ label: "Import", to: "/payments/import" }],
        },
        filtered: { title: "No payment for “{search}”" },
        error: {
          title: "Unavailable",
          component: CustomComponent("PaymentsOutage"),
        },
      },
    });
    expect(options.emptyStates?.firstRun).to.deep.equal({
      title: "$payments.empty.title",
      actions: [{ label: "Import", to: "/payments/import" }],
      component: undefined,
    });
    expect(options.emptyStates?.error?.component?.componentName).to.equal(
      "PaymentsOutage",
    );
  });

  it("serializes a custom action's bulk and deep link options", () => {
    const options = optionsOf({
      rowActions: {
        ...READ_ONLY,
        custom: [
          {
            label: "Refund",
            bulk: { allMatching: true },
            target: { type: "api", url: "/refund", successMessage: "Done" },
          },
          {
            label: "Details",
            deepLink: true,
            target: {
              type: "drawer",
              component: CustomComponent("PaymentDrawer"),
            },
          },
        ],
      },
    });
    const [refund, details] = options.rowActions!.custom!;
    expect(refund?.bulk).to.deep.equal({ allMatching: true });
    expect(details?.deepLink).to.equal(true);
  });
});
