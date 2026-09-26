import { describe, expect, it } from "vitest";
import {
  addActiveStateToMenuItems,
  isMenuItemActive,
} from "../layers/dms-core/app/utils/menu";
import { buildMenuItemTarget } from "../layers/dms-ui/app/build/types/tree";

type TreeNode = Parameters<typeof buildMenuItemTarget>[0];

function node(overrides: Partial<TreeNode>): TreeNode {
  return {
    id: "project",
    fullId: "cloud.projects.project",
    fullSlug: "/project",
    displayName: "Project",
    layoutUrl: "/project/pagelayout",
    children: {},
    childrenOrders: [],
    ...overrides,
  } as TreeNode;
}

function route(path: string, query: Record<string, unknown> = {}) {
  return { path, query };
}

describe("buildMenuItemTarget", () => {
  it("returns the bare slug when the entry declares no query", () => {
    expect(buildMenuItemTarget(node({}))).to.equal("/project");
  });

  it("returns a string link carrying the query the entry declares", () => {
    expect(
      buildMenuItemTarget(node({ query: { project: "invoicer" } })),
    ).to.equal("/project?project=invoicer");
  });

  it("encodes the query values of the link", () => {
    expect(
      buildMenuItemTarget(node({ query: { project: "a b&c", env: "prod" } })),
    ).to.equal("/project?project=a+b%26c&env=prod");
  });

  it("returns no target for a category that has no page behind it", () => {
    expect(buildMenuItemTarget(node({ layoutUrl: undefined }))).to.equal(
      undefined,
    );
  });
});

describe("isMenuItemActive with query entries", () => {
  const invoicer = {
    fullId: "cloud.projects.invoicer",
    to: "/project?project=invoicer",
  };
  const resto = {
    fullId: "cloud.projects.resto",
    to: "/project?project=resto",
  };

  it("highlights only the entry matching the current query", () => {
    const current = route("/project", { project: "invoicer" });
    expect(isMenuItemActive(invoicer, null, current)).to.equal(true);
    expect(isMenuItemActive(resto, null, current)).to.equal(false);
  });

  it("ignores query parameters the entry does not declare", () => {
    const current = route("/project", { project: "invoicer", env: "prod" });
    expect(isMenuItemActive(invoicer, null, current)).to.equal(true);
  });

  it("tells apart entries whose query values share a prefix", () => {
    const current = route("/project", { project: "invoicer-2" });
    expect(isMenuItemActive(invoicer, null, current)).to.equal(false);
  });

  it("stays active on the entry's sub-routes carrying its query", () => {
    const current = route("/project/settings", { project: "invoicer" });
    expect(isMenuItemActive(invoicer, null, current)).to.equal(true);
  });

  it("still accepts an object target", () => {
    const entry = { to: { path: "/project", query: { project: "invoicer" } } };
    const current = route("/project", { project: "invoicer" });
    expect(isMenuItemActive(entry, null, current)).to.equal(true);
  });

  it("stays inactive on the same path without the entry's query", () => {
    expect(isMenuItemActive(invoicer, null, route("/project"))).to.equal(false);
  });

  it("does not let the fullId fallback override a query mismatch", () => {
    const current = route("/project", { project: "resto" });
    expect(
      isMenuItemActive(invoicer, "cloud.projects.invoicer", current),
    ).to.equal(false);
  });

  it("keeps highlighting a plain entry on its sub-routes", () => {
    const orders = { fullId: "pages.orders", to: "/orders" };
    expect(isMenuItemActive(orders, null, route("/orders/detail/42"))).to.equal(
      true,
    );
  });
});

describe("addActiveStateToMenuItems", () => {
  it("marks a single query entry active across a group", () => {
    const groups = [
      [
        { id: "invoicer", to: "/project?project=invoicer" },
        { id: "resto", to: "/project?project=resto" },
      ],
    ];

    const [group] = addActiveStateToMenuItems(
      groups,
      null,
      route("/project", { project: "resto" }),
    );

    expect(group?.[0]?.active).to.equal(false);
    expect(group?.[1]?.active).to.equal(true);
  });

  it("leaves the native highlighting of an inactive plain entry alone", () => {
    const [group] = addActiveStateToMenuItems(
      [[{ id: "orders", to: "/orders" }]],
      null,
      route("/invoices"),
    );

    expect(group?.[0]?.active).to.equal(undefined);
  });
});
