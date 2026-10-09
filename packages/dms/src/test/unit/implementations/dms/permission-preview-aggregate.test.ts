import { expect } from "chai";
import {
  aggregatePreviewMenu,
  previewCacheKey,
  PreviewScopeCache,
  type PreviewMenuNode,
} from "../../../../implementations/dms/permission-preview";

function page(fullId: string): PreviewMenuNode {
  return { fullId, opensPage: true, children: [] };
}

function group(fullId: string, children: PreviewMenuNode[]): PreviewMenuNode {
  return { fullId, opensPage: false, children };
}

// pages › sales (group) › orders, invoices; pages › crm (group) › contacts
// (group) › list; settings (a page holding groups) › users (group) › members,
// roles.
const MENU: PreviewMenuNode[] = [
  group("pages", [
    group("pages.sales", [
      page("pages.sales.orders"),
      page("pages.sales.invoices"),
    ]),
    group("pages.crm", [
      group("pages.crm.contacts", [page("pages.crm.contacts.list")]),
    ]),
  ]),
  {
    fullId: "settings",
    opensPage: true,
    children: [
      group("settings.users", [
        page("settings.users.members"),
        page("settings.users.roles"),
      ]),
    ],
  },
];

function states(denied: string[], losesInside: string[] = []) {
  const result = aggregatePreviewMenu(
    MENU,
    new Set(denied),
    new Set(losesInside),
  );
  return {
    hidden: [...result.hidden].sort(),
    partial: [...result.partial].sort(),
  };
}

describe("[unit] implementations/dms/permission-preview — menu aggregation", () => {
  it("keeps every entry full when the set loses nothing", () => {
    expect(states([])).to.deep.equal({ hidden: [], partial: [] });
  });

  it("draws a page losing a block partial, and every group up to the root", () => {
    expect(states([], ["pages.sales.orders"])).to.deep.equal({
      hidden: [],
      partial: ["pages", "pages.sales", "pages.sales.orders"],
    });
  });

  it("draws a group partial when only some of its entries are refused", () => {
    expect(states(["pages.sales.invoices"])).to.deep.equal({
      hidden: ["pages.sales.invoices"],
      partial: ["pages", "pages.sales"],
    });
  });

  it("refuses a group whose every entry is refused, at any depth", () => {
    expect(states(["pages.crm.contacts.list"])).to.deep.equal({
      hidden: ["pages.crm", "pages.crm.contacts", "pages.crm.contacts.list"],
      partial: ["pages"],
    });
  });

  it("keeps a page holding groups partial, never refused, while it opens", () => {
    expect(
      states(["settings.users.members", "settings.users.roles"]),
    ).to.deep.equal({
      hidden: [
        "settings.users",
        "settings.users.members",
        "settings.users.roles",
      ],
      partial: ["settings"],
    });
  });

  it("judges a page every member opens on its own page, not on what it holds", () => {
    const result = aggregatePreviewMenu(
      MENU,
      new Set(["settings.users.members", "settings.users.roles"]),
      new Set(),
      new Set(["settings"]),
    );
    expect([...result.hidden].sort()).to.deep.equal([
      "settings.users",
      "settings.users.members",
      "settings.users.roles",
    ]);
    expect(result.partial).to.deep.equal([]);
  });

  it("still draws a page every member opens partial when it loses a block", () => {
    const result = aggregatePreviewMenu(
      MENU,
      new Set(["settings.users.roles"]),
      new Set(["settings"]),
      new Set(["settings"]),
    );
    expect([...result.partial].sort()).to.deep.equal([
      "settings",
      "settings.users",
    ]);
  });

  it("keeps an entry refused by access refused, whatever it holds", () => {
    expect(states(["pages.sales"], ["pages.sales.orders"])).to.deep.equal({
      hidden: ["pages.sales"],
      partial: ["pages", "pages.sales.orders"],
    });
  });

  it("leaves an empty group as access decides", () => {
    const result = aggregatePreviewMenu(
      [group("pages.empty", [])],
      new Set(),
      new Set(),
    );
    expect(result).to.deep.equal({ hidden: [], partial: [] });
  });
});

describe("[unit] implementations/dms/permission-preview — loss cache", () => {
  const scope = {
    tenantId: "t1",
    userId: "u1",
    structureVersion: 1,
    real: ["a", "b"],
    preview: ["a"],
  };

  it("keys a scope by its sets, in any order", () => {
    expect(previewCacheKey(scope)).to.equal(
      previewCacheKey({ ...scope, real: ["b", "a", "a"] }),
    );
    expect(previewCacheKey(scope)).to.not.equal(
      previewCacheKey({ ...scope, preview: ["a", "b"] }),
    );
    expect(previewCacheKey(scope)).to.not.equal(
      previewCacheKey({ ...scope, structureVersion: 2 }),
    );
    expect(previewCacheKey(scope)).to.not.equal(
      previewCacheKey({ ...scope, userId: "u2" }),
    );
  });

  it("answers a scope from its entry until it expires", () => {
    let time = 0;
    const cache = new PreviewScopeCache<boolean>(1000, 4, () => time);
    const pages = cache.pagesFor("k");
    pages.set("pages.sales.orders", Promise.resolve(true));
    time = 999;
    expect(cache.pagesFor("k").has("pages.sales.orders")).to.equal(true);
    time = 2000;
    expect(cache.pagesFor("k").has("pages.sales.orders")).to.equal(false);
  });

  it("drops the least recent scope beyond its capacity", () => {
    const cache = new PreviewScopeCache<boolean>(1000, 2, () => 0);
    cache.pagesFor("a").set("p", Promise.resolve(true));
    cache.pagesFor("b").set("p", Promise.resolve(true));
    // Reading `a` again makes `b` the oldest.
    cache.pagesFor("a");
    cache.pagesFor("c");
    expect(cache.pagesFor("a").has("p")).to.equal(true);
    expect(cache.pagesFor("b").has("p")).to.equal(false);
  });
});
