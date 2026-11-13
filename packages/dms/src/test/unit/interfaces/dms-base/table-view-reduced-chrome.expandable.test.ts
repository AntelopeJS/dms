import { expect } from "chai";
import type { IsAssignable } from "../../../helpers/type-checks";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  TableView,
  type TableViewOptions,
} from "@antelopejs/interface-dms/base/table-view";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { resolveCustomRowActions } from "@antelopejs/interface-dms/base/table-view/internal/request-filter";
import { resolveTableViewTabs } from "@antelopejs/interface-dms/base/table-view/internal/tabs";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";
import {
  LineAPI,
  LINES_LOCATION,
  optionsOf,
  OrderAPI,
} from "./table-view-reduced-chrome.fixture";

function registerExpandableRowCases(): void {
  it("normalizes the expandable fields and refuses an unknown one", () => {
    const options = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        expandable: {
          fields: ["carrier", { key: "status", label: "State" }],
          defaultExpanded: "first",
          single: true,
        },
      }),
    );
    expect(options.expandable).to.deep.equal({
      fields: [{ key: "carrier" }, { key: "status", label: "State" }],
      fieldsLabel: undefined,
      defaultExpanded: "first",
      single: true,
      lazyLoad: undefined,
    });
    expect(() =>
      TableView(OrderAPI, {
        realtime: false,
        expandable: { fields: ["missing"] },
      }),
    ).to.throw(/expandable fields .* unknown column "missing"/);
  });

  it("passes lazyLoad through, with fields or a component", () => {
    const fields = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        expandable: { fields: ["carrier"], lazyLoad: true },
      }),
    );
    expect(fields.expandable).to.include({ lazyLoad: true });
    const component = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        expandable: {
          component: CustomComponent("OrderLines"),
          lazyLoad: true,
        },
      }),
    );
    expect(component.expandable).to.include({ lazyLoad: true });
  });

  it("hands the band to a component alone, refusing both or neither", () => {
    const component = CustomComponent("OrderLines");
    const options = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        expandable: { component, single: true },
      }),
    );
    expect(options.expandable).to.deep.equal({
      defaultExpanded: undefined,
      single: true,
      lazyLoad: undefined,
      component: component.serializeSync(),
    });

    const both = {
      component,
      fields: ["carrier"],
    };
    expect(() =>
      // @ts-expect-error Both alternatives are deliberately present to exercise runtime validation.
      TableView(OrderAPI, { realtime: false, expandable: both }),
    ).to.throw(/both fields and a component/);
    const neither = { single: true };
    expect(() =>
      // @ts-expect-error Both alternatives are deliberately absent to exercise runtime validation.
      TableView(OrderAPI, { realtime: false, expandable: neither }),
    ).to.throw(/neither fields nor a component/);
  });
}

function registerLinkTabCases(): void {
  it("serializes link tabs: a path, the count location, no filters", () => {
    const options = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        tabs: [
          { id: "all", label: "Orders" },
          {
            id: "lines",
            label: "Lines",
            to: "/orders/lines",
            permissionId: "orders.lines",
            countFrom: LineAPI,
            navBadge: true,
          },
          {
            id: "open",
            label: "Open",
            filter: { accessorKey: "status", value: "open", mode: "is" },
          },
        ],
      }),
    );
    expect(options.tabs).to.deep.equal([
      { id: "all", label: "Orders" },
      {
        id: "lines",
        label: "Lines",
        navBadge: true,
        to: "/orders/lines",
        countFrom: LINES_LOCATION,
      },
      {
        id: "open",
        label: "Open",
        filter: { accessorKey: "status", value: "open", mode: "is" },
      },
    ]);
  });

  it("refuses a tab that both filters and links", () => {
    expect(() =>
      TableView(OrderAPI, {
        realtime: false,
        tabs: [
          {
            id: "lines",
            label: "Lines",
            to: "/orders/lines",
            filter: { accessorKey: "status", value: "x", mode: "is" },
          },
        ],
      }),
    ).to.throw(/tab "lines" .* both a filter and a link/);
  });
}

function registerTabGateAndRowActionCases(): void {
  it("keeps a link tab without a permission and every tab of a table without links", async () => {
    const declared = [{ id: "a", label: "A", to: "/a" }];
    const serialized = [{ id: "a", label: "A", to: "/a" }];
    expect(
      await resolveTableViewTabs(new Set(), declared, serialized, "pages.t"),
    ).to.deep.equal(serialized);
    expect(
      await resolveTableViewTabs(new Set(), undefined, undefined, "pages.t"),
    ).to.equal(undefined);
  });

  it("gates a tab on an action of its table, or on an absolute permission id", async () => {
    const declared = [
      { id: "mine", label: "Mine", permission: "list" },
      { id: "audit", label: "Audit", permissionId: "audit.read" },
      { id: "all", label: "All" },
    ];
    const serialized = declared.map(({ id, label }) => ({ id, label }));
    const served = async (held: string[]) =>
      (
        await resolveTableViewTabs(
          new Set(withPermissionAncestors(held)),
          declared,
          serialized,
          "pages.t.table",
        )
      )?.map((tab) => tab.id);

    expect(await served([])).to.deep.equal(["all"]);
    expect(await served(["pages.t.table.list", "audit.read"])).to.deep.equal([
      "mine",
      "audit",
      "all",
    ]);
  });

  it("serializes the look of custom row actions and keeps those without a permission", async () => {
    const options = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        rowActions: {
          custom: [
            {
              id: "resend",
              label: "Resend",
              icon: "i-ph-paper-plane-tilt",
              isVisible: true,
              showLabel: true,
              color: "error",
              target: { type: "page", url: "/x/{{row._id}}" },
            },
          ],
        },
      }),
    );
    const [action] = options.rowActions?.custom ?? [];
    expect(action).to.include({
      id: "resend",
      color: "error",
      showLabel: true,
    });
    expect(
      await resolveCustomRowActions(
        new Set(),
        [{}],
        options.rowActions?.custom,
        "orders",
      ),
    ).to.have.length(1);
  });
}

function registerConfirmationCases(): void {
  it("serializes one confirmation type on every action, its fields included", () => {
    const options = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        rowActions: {
          delete: {
            confirm: { from: "/api/orders/{{row.id}}/delete-confirm" },
            successMessage: "$orders.deleted",
          },
          edit: { confirm: { title: "$orders.edit_locked" } },
          custom: [
            {
              label: "Refund",
              target: {
                type: "api",
                url: "/api/orders/{{row._id}}/refund",
                successMessage: "Done",
              },
              confirm: {
                title: "Refund {number}?",
                color: "warning",
                fields: [
                  {
                    id: "reason",
                    label: "Reason",
                    type: new DefaultDataTypes.StringType(),
                    required: true,
                  },
                ],
              },
            },
          ],
        },
        customButtons: [
          {
            label: "Purge",
            target: {
              type: "api",
              url: "/api/orders/purge",
              successMessage: "Purged",
            },
            confirm: { title: "Purge?", confirmText: "PURGE", blocked: false },
          },
        ],
      }),
    );
    expect(options.rowActions?.delete).to.deep.equal({
      confirm: { from: "/api/orders/{{row.id}}/delete-confirm" },
      successMessage: "$orders.deleted",
    });
    expect(options.rowActions?.edit).to.deep.equal({
      confirm: { title: "$orders.edit_locked" },
    });
    const [refund] = options.rowActions?.custom ?? [];
    const refundConfirm = refund?.confirm;
    const [reason] =
      refundConfirm && "fields" in refundConfirm
        ? (refundConfirm.fields ?? [])
        : [];
    expect(reason).to.deep.include({
      id: "reason",
      type: "string",
      required: true,
    });
    expect(options.customButtons?.[0]?.confirm).to.deep.equal({
      title: "Purge?",
      confirmText: "PURGE",
      blocked: false,
    });
  });

  it("types successMessage on delete, archive and restore only", () => {
    type RowActions = NonNullable<TableViewOptions<OrderAPI>["rowActions"]>;
    const answers: [
      IsAssignable<
        { successMessage: "$orders.archived" },
        RowActions["archive"]
      >,
      IsAssignable<{ successMessage: "$orders.edited" }, RowActions["edit"]>,
    ] = [true, false];
    const options = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        rowActions: { archive: { successMessage: "$orders.archived" } },
      }),
    );
    expect(answers).to.deep.equal([true, false]);
    expect(options.rowActions?.archive).to.include({
      successMessage: "$orders.archived",
    });
  });
}

describe("[unit] interfaces/dms-base — table view expandable rows, tabs and row actions", () => {
  registerExpandableRowCases();
  registerLinkTabCases();
  registerTabGateAndRowActionCases();
  registerConfirmationCases();
});
