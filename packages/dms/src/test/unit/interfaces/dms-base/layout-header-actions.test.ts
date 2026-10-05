import { expect } from "chai";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import type { PageHeaderButtonSerialized } from "@antelopejs/interface-dms/base/layouts";
import type { ComponentInfoSerialized } from "@antelopejs/interface-dms/component";
import {
  filterLayoutHeaderActions,
  withComponentHeaderButtons,
} from "@antelopejs/interface-dms/page/layout-filter";

const CONTEXT = { tenantId: "tenant", user: undefined };

function actionsOf(options: unknown): PageHeaderButtonSerialized[] {
  return (options as { headerActions?: PageHeaderButtonSerialized[] })
    .headerActions!;
}

describe("[unit] interfaces/dms-base/layouts — header buttons", () => {
  it("leaves the option out unless a page declares buttons", () => {
    expect(DefaultLayout().options).to.not.have.property("headerActions");
  });

  it("serves the same buttons as a table's toolbar, keyed by id or place", () => {
    const layout = DefaultLayout({
      headerActions: [
        {
          id: "new",
          label: "New invoice",
          color: "primary",
          target: { type: "quickAction", id: "billing:new-invoice" },
        },
        {
          label: "Docs",
          target: {
            type: "external",
            url: "https://antelopejs.com",
            newTab: true,
          },
        },
        {
          id: "purge",
          label: "Purge",
          target: { type: "api", url: "/api/purge", successMessage: "Purged" },
          confirm: { title: "Purge?", confirmText: "PURGE" },
        },
      ],
    });

    expect(actionsOf(layout.options)).to.deep.equal([
      {
        id: "new",
        label: "New invoice",
        color: "primary",
        target: { type: "quickAction", id: "billing:new-invoice" },
      },
      {
        id: "header-1",
        label: "Docs",
        target: {
          type: "external",
          url: "https://antelopejs.com",
          newTab: true,
        },
      },
      {
        id: "purge",
        label: "Purge",
        target: { type: "api", url: "/api/purge", successMessage: "Purged" },
        confirm: { title: "Purge?", confirmText: "PURGE" },
      },
    ]);
  });

  it("keeps the full-width default next to the buttons", () => {
    const layout = DefaultLayout({ headerActions: [] });
    expect(layout.options).to.deep.equal({
      fullWidth: true,
      headerActions: [],
    });
  });
});

describe("[unit] interfaces/dms/page — header buttons served per caller", () => {
  const link = (id: string, permission?: string) => ({
    id,
    label: id,
    target: { type: "page" as const, url: `/${id}` },
    permission,
  });
  const layout = DefaultLayout({
    headerActions: [
      link("open"),
      link("audit", "billing.audit"),
      link("export", "billing.export"),
    ],
  });

  it("leaves out the buttons whose permission the caller lacks", async () => {
    const filtered = await filterLayoutHeaderActions(
      layout,
      async () => new Set(["billing.export"]),
      CONTEXT,
    );

    expect(
      actionsOf(filtered!.options).map((action) => action.id),
    ).to.deep.equal(["open", "export"]);
    expect(actionsOf(filtered!.options)[1]).to.not.have.property("permission");
  });

  it("disables a button its availability refuses, with the reason", async () => {
    const limited = DefaultLayout({
      headerActions: [
        {
          ...link("invite"),
          availability: ({ tenantId }) =>
            tenantId === "tenant" ? { reason: "$seats.full" } : undefined,
        },
      ],
    });

    const [invite] = actionsOf(
      (await filterLayoutHeaderActions(
        limited,
        async () => new Set(),
        CONTEXT,
      ))!.options,
    );

    expect(invite).to.deep.include({
      disabled: true,
      disabledReason: "$seats.full",
    });
    expect(invite).to.not.have.property("availability");
  });

  it("does not load permissions when no button declares one", async () => {
    const open = DefaultLayout({ headerActions: [link("open")] });
    let loaded = false;

    await filterLayoutHeaderActions(
      open,
      async () => {
        loaded = true;
        return new Set<string>();
      },
      CONTEXT,
    );

    expect(loaded).to.equal(false);
  });

  it("does not touch the layout it was given", async () => {
    await filterLayoutHeaderActions(layout, async () => new Set(), CONTEXT);
    expect(actionsOf(layout.options)).to.have.length(3);
  });
});

describe("[unit] interfaces/dms/page — a table's buttons placed in the header", () => {
  const components = {
    table: {
      componentName: "dms-table-view",
      options: {
        customButtons: [
          {
            id: "invite",
            label: "Invite",
            color: "primary",
            placement: "header",
            disabled: true,
            disabledReason: "$seats.full",
            target: { type: "modal", component: { componentName: "x" } },
          },
          {
            id: "export",
            label: "Export",
            target: { type: "page", url: "/x" },
          },
        ],
        rowActions: { add: { placement: "header", label: "$tasks.new" } },
      },
    },
  } as unknown as Record<string, ComponentInfoSerialized>;

  it("adds them after the page's own, naming the component that runs them", () => {
    const layout = withComponentHeaderButtons(
      DefaultLayout({
        headerActions: [
          { label: "Docs", target: { type: "page", url: "/docs" } },
        ],
      }),
      components,
    );

    expect(actionsOf(layout!.options)).to.deep.equal([
      { id: "header-0", label: "Docs", target: { type: "page", url: "/docs" } },
      {
        id: "table:invite",
        label: "Invite",
        color: "primary",
        disabled: true,
        disabledReason: "$seats.full",
        componentId: "table",
        buttonId: "invite",
      },
      {
        id: "table:add",
        label: "$tasks.new",
        icon: "i-ph-plus",
        color: "primary",
        componentId: "table",
      },
    ]);
  });

  it("adds no add button the caller was not served", () => {
    const refused = {
      table: {
        ...components.table,
        options: { rowActions: { add: false } },
      },
    } as unknown as Record<string, ComponentInfoSerialized>;
    const layout = DefaultLayout();
    expect(withComponentHeaderButtons(layout, refused)).to.equal(layout);
  });
});
