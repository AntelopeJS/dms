import { expect } from "chai";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import type { PageHeaderButtonSerialized } from "@antelopejs/interface-dms/base/internal/layouts";
import type { ComponentInfoSerialized } from "@antelopejs/interface-dms/component";
import {
  filterLayoutHeaderActions,
  withComponentHeaderButtons,
} from "@antelopejs/interface-dms/page/internal/layout-filter";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";
import { resolveCustomButtons } from "@antelopejs/interface-dms/base/table-view/internal/request-filter";
import type { CustomButton } from "@antelopejs/interface-dms/base/types/custom-button";
import { headerActionsOf } from "../../../helpers/serialized-options";

const CONTEXT = { tenantId: "tenant", user: undefined };

function actionsOf(
  layout: Parameters<typeof headerActionsOf>[0],
): PageHeaderButtonSerialized[] {
  return headerActionsOf(layout).headerActions;
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

    expect(actionsOf(layout)).to.deep.equal([
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

  it("serves a download target as declared, its tokens for the client", () => {
    const target = {
      type: "download" as const,
      url: "/api/lang/translations/export?workspace={{query.workspace}}&locale={{query.locale}}",
      filename: "{{query.locale}}.json",
    };
    const layout = DefaultLayout({
      headerActions: [{ id: "download-language", label: "Download", target }],
    });

    expect(actionsOf(layout)).to.deep.equal([
      { id: "download-language", label: "Download", target },
    ]);
  });

  it("serves the order a button declares", () => {
    const layout = DefaultLayout({
      headerActions: [
        {
          id: "add",
          label: "Add",
          target: { type: "page", url: "/a" },
          order: 1,
        },
      ],
    });
    expect(actionsOf(layout)[0]).to.deep.include({ order: 1 });
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
      link("audit", "audit"),
      link("export", "export"),
      { ...link("ledger"), permissionId: "pages.ledger.view" },
    ],
  });

  it("leaves out the buttons whose permission the caller lacks, an action of the page by name", async () => {
    const filtered = await filterLayoutHeaderActions(
      layout,
      async () =>
        new Set(
          withPermissionAncestors([
            "pages.billing.export",
            "pages.ledger.view",
          ]),
        ),
      CONTEXT,
      "pages.billing",
    );

    expect(actionsOf(filtered).map((action) => action.id)).to.deep.equal([
      "open",
      "export",
      "ledger",
    ]);
    expect(actionsOf(filtered)[1]).to.not.have.property("permission");
    expect(actionsOf(filtered)[2]).to.not.have.property("permissionId");
  });

  it("refuses a button naming an action when the page has no permission id", async () => {
    const filtered = await filterLayoutHeaderActions(
      layout,
      async () => new Set(withPermissionAncestors(["pages.billing.export"])),
      CONTEXT,
      undefined,
    );

    expect(actionsOf(filtered).map((action) => action.id)).to.deep.equal([
      "open",
    ]);
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
      await filterLayoutHeaderActions(
        limited,
        async () => new Set(),
        CONTEXT,
        "pages.billing",
      ),
    );

    expect(invite).to.deep.include({
      disabled: true,
      disabledReason: "$seats.full",
    });
    expect(invite).to.not.have.property("availability");
  });

  it("leaves out a button its availability hides, for that query only", async () => {
    const scoped = DefaultLayout({
      headerActions: [
        link("open"),
        {
          ...link("add-key"),
          availability: ({ query }) =>
            query?.workspace === "modules" ? { hidden: true } : undefined,
        },
      ],
    });
    const serve = async (query: Record<string, string>) =>
      headerActionsOf(
        await filterLayoutHeaderActions(
          scoped,
          async () => new Set(),
          { ...CONTEXT, query },
          "pages.lang",
        ),
      );

    const readOnly = await serve({ workspace: "modules" });
    expect(readOnly.headerActions.map((action) => action.id)).to.deep.equal([
      "open",
    ]);
    expect(readOnly.headerActionsQuery).to.deep.equal({ workspace: "modules" });
    const own = await serve({ workspace: "own" });
    expect(own.headerActions.map((action) => action.id)).to.deep.equal([
      "open",
      "add-key",
    ]);
    expect(own.headerActions[1]).to.not.have.property("disabled");
  });

  it("hands availability the page query, and says which query it served", async () => {
    const queue = DefaultLayout({
      headerActions: [
        {
          ...link("download"),
          availability: ({ query }) =>
            query?.locale === "de" ? undefined : { reason: "$lang.missing" },
        },
      ],
    });
    const serve = async (query: Record<string, string>) =>
      headerActionsOf(
        await filterLayoutHeaderActions(
          queue,
          async () => new Set(),
          { ...CONTEXT, query },
          "pages.lang",
        ),
      );

    const german = await serve({ workspace: "web", locale: "de" });
    expect(german.headerActions[0]).to.not.have.property("disabled");
    expect(german.headerActionsQuery).to.deep.equal({
      workspace: "web",
      locale: "de",
    });
    const french = await serve({ locale: "fr" });
    expect(french.headerActions[0]).to.deep.include({ disabled: true });
  });

  it("names no query when no button declares an availability", async () => {
    const filtered = await filterLayoutHeaderActions(
      DefaultLayout({ headerActions: [link("open")] }),
      async () => new Set(),
      { ...CONTEXT, query: { workspace: "web" } },
      "pages.billing",
    );
    expect(filtered!.options).to.not.have.property("headerActionsQuery");
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
      "pages.billing",
    );

    expect(loaded).to.equal(false);
  });

  it("does not touch the layout it was given", async () => {
    await filterLayoutHeaderActions(
      layout,
      async () => new Set(),
      CONTEXT,
      "pages.billing",
    );
    expect(actionsOf(layout)).to.have.length(4);
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
  } satisfies Record<string, ComponentInfoSerialized>;

  it("adds them after the page's own, naming the component that runs them", () => {
    const layout = withComponentHeaderButtons(
      DefaultLayout({
        headerActions: [
          { label: "Docs", target: { type: "page", url: "/docs" } },
        ],
      }),
      components,
    );

    expect(actionsOf(layout)).to.deep.equal([
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
    } satisfies Record<string, ComponentInfoSerialized>;
    const layout = DefaultLayout();
    expect(withComponentHeaderButtons(layout, refused)).to.equal(layout);
  });

  it("adds those of a nested table, named by its id in the page", () => {
    const nested = {
      content: {
        componentName: "dms-tabs",
        children: [
          {
            id: "orders",
            component: {
              componentName: "dms-card",
              children: [{ id: "lines", component: components.table }],
            },
          },
        ],
      },
    } satisfies Record<string, ComponentInfoSerialized>;

    const layout = withComponentHeaderButtons(DefaultLayout(), nested);

    expect(
      actionsOf(layout).map(({ id, componentId, buttonId }) => ({
        id,
        componentId,
        buttonId,
      })),
    ).to.deep.equal([
      {
        id: "content-child-orders-child-lines:invite",
        componentId: "content-child-orders-child-lines",
        buttonId: "invite",
      },
      {
        id: "content-child-orders-child-lines:add",
        componentId: "content-child-orders-child-lines",
        buttonId: undefined,
      },
    ]);
  });
});

describe("[unit] interfaces/dms-base/table-view — a toolbar button its availability hides", () => {
  it("is left out of the buttons served, the others kept", async () => {
    const declared = [
      { id: "export", label: "Export", target: { type: "page", url: "/x" } },
      {
        id: "add",
        label: "Add",
        target: { type: "page", url: "/new" },
        availability: () => ({ hidden: true }),
      },
      {
        id: "purge",
        label: "Purge",
        target: { type: "page", url: "/purge" },
        availability: () => ({ reason: "$locked" }),
      },
    ] satisfies CustomButton[];
    const serialized = declared.map(
      ({ availability: _availability, ...button }) => button,
    );

    const served = await resolveCustomButtons(
      new Set(),
      declared,
      serialized,
      "pages.lang.table",
      CONTEXT,
    );

    expect(served?.map((button) => button.id)).to.deep.equal([
      "export",
      "purge",
    ]);
    expect(served?.[1]).to.deep.include({
      disabled: true,
      disabledReason: "$locked",
    });
  });
});
