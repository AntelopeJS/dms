import { expect } from "chai";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import type { PageHeaderActionSerialized } from "@antelopejs/interface-dms/base/layouts";
import { filterLayoutHeaderActions } from "@antelopejs/interface-dms/page/layout-filter";
import type { QuickActionInfo } from "@antelopejs/interface-dms/quick-actions";

const QUICK_ACTION = {
  id: "new-invoice",
  category: { id: "billing", displayName: "Billing" },
  displayName: "New invoice",
  icon: "i-ph-receipt",
} as unknown as QuickActionInfo;

function actionsOf(options: unknown): PageHeaderActionSerialized[] {
  return (options as { headerActions?: PageHeaderActionSerialized[] })
    .headerActions!;
}

describe("[unit] interfaces/dms-base/layouts — header actions", () => {
  it("leaves the option out unless a page declares actions", () => {
    expect(DefaultLayout().options).to.not.have.property("headerActions");
  });

  it("serves a quick action by its category-qualified key", () => {
    const layout = DefaultLayout({
      headerActions: [
        { id: "new", quickAction: QUICK_ACTION, color: "primary" },
        { id: "byKey", quickAction: "billing:export" },
        { id: "docs", label: "Docs", to: "https://antelopejs.com" },
      ],
    });

    expect(actionsOf(layout.options)).to.deep.equal([
      { id: "new", quickAction: "billing:new-invoice", color: "primary" },
      { id: "byKey", quickAction: "billing:export" },
      { id: "docs", label: "Docs", to: "https://antelopejs.com" },
    ]);
  });

  it("keeps the full-width default next to the actions", () => {
    const layout = DefaultLayout({ headerActions: [] });
    expect(layout.options).to.deep.equal({
      fullWidth: true,
      headerActions: [],
    });
  });
});

describe("[unit] interfaces/dms/page — header actions filtered per caller", () => {
  const layout = DefaultLayout({
    headerActions: [
      { id: "open", label: "Open", to: "/a" },
      {
        id: "audit",
        label: "Audit",
        to: "/audit",
        permission: "billing.audit",
      },
      { id: "export", label: "Export", to: "/x", permission: "billing.export" },
    ],
  });

  it("leaves out the actions whose permission the caller lacks", async () => {
    const filtered = await filterLayoutHeaderActions(
      layout,
      async () => new Set(["billing.export"]),
    );

    expect(
      actionsOf(filtered!.options).map((action) => action.id),
    ).to.deep.equal(["open", "export"]);
  });

  it("keeps every action for a caller holding every permission", async () => {
    const filtered = await filterLayoutHeaderActions(
      layout,
      async () => new Set(["*"]),
    );

    expect(actionsOf(filtered!.options)).to.have.length(3);
  });

  it("does not load permissions when no action declares one", async () => {
    const open = DefaultLayout({
      headerActions: [{ id: "open", label: "Open", to: "/a" }],
    });
    let loaded = false;

    const filtered = await filterLayoutHeaderActions(open, async () => {
      loaded = true;
      return new Set<string>();
    });

    expect(loaded).to.equal(false);
    expect(filtered).to.equal(open);
  });

  it("does not touch the layout it was given", async () => {
    await filterLayoutHeaderActions(layout, async () => new Set<string>());
    expect(actionsOf(layout.options)).to.have.length(3);
  });
});
