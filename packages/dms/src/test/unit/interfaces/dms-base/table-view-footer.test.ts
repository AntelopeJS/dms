import { GetMetadata } from "@antelopejs/interface-core";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view";
import { expect } from "chai";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { assertRowRule } from "@antelopejs/interface-dms/base/table-view/internal/row-rule-shape";
import {
  optionsOf,
  PaymentAPI,
  type PaymentOptions,
  READ_ONLY,
} from "./table-view-footer.fixture";

type FooterRule = NonNullable<
  NonNullable<NonNullable<PaymentOptions["footer"]>["summary"]>[number]["where"]
>;

const nestedNot = (depth: number): FooterRule => {
  let rule: FooterRule = { field: "amount", equals: 1 };
  for (let level = 0; level < depth; level += 1) rule = { not: rule };
  return rule;
};

function registerSummaryCases(): void {
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

  it("refuses a malformed where rule with the row-rule check its declaration runs", () => {
    const subject = "Bad has a malformed rule";
    expect(() =>
      assertRowRule(
        { field: "amount", equals: 41, and: 123 },
        subject,
        "where",
      ),
    ).to.throw(/where\.and must be an array of rules/);
    expect(() =>
      assertRowRule(
        { field: "amount", notIn: [41], in: 123 },
        subject,
        "where",
      ),
    ).to.throw(/where\.in must be an array/);
    expect(() =>
      assertRowRule(
        { not: { or: [{ field: "amount", in: "x" }] } },
        subject,
        "where",
      ),
    ).to.throw(/where\.not\.or\[0\]\.in must be an array/);
    expect(() => assertRowRule({ field: "amount" }, subject, "where")).to.throw(
      /where must name an operator/,
    );
    expect(() =>
      assertRowRule({ and: [{ equals: 1 }] }, subject, "where"),
    ).to.throw(/where\.and\[0\]\.field must be a string/);
  });

  it("refuses a where rule nested deeper than 64 levels at declaration", () => {
    const declare = (depth: number) =>
      optionsOf({
        footer: {
          summary: [
            {
              label: "Deep",
              op: "count",
              where: nestedNot(depth),
            },
          ],
        },
      });
    expect(() => declare(65)).to.throw(
      /footer summary "Deep".*where(\.not)+ nests rules deeper than 64 levels/,
    );
    expect(() => declare(64)).not.to.throw();
  });
}

function registerEmptyStateCases(): void {
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
}

describe("[unit] interfaces/dms-base — table view footer and empty states", () => {
  registerSummaryCases();
  registerEmptyStateCases();
});
