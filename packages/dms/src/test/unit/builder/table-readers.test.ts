import { expect } from "chai";
import {
  CreateCategory,
  CreatePage,
  CreateResource,
  GetPageStructure,
  SetPageBlocks,
} from "../../../implementations/dms-builder";
import {
  pageImpact,
  tableReaders,
} from "../../../implementations/dms-builder/engine/table-readers";
import { createFixture, destroyFixture, expectOk } from "./harness";

/**
 * What a table reaches, said before it is changed: the pages reading it, by a
 * block bound to it or a block pointing at its API.
 */
describe("the pages reading a table", () => {
  before(async function () {
    this.timeout(120_000);
    createFixture();
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "CreateCategory",
    );
    for (const [name, displayName] of [
      ["board", "Board"],
      ["intake", "Intake"],
      ["quiet", "Quiet"],
      ["odd", "Odd"],
      ["named", "Named"],
    ] as const) {
      expectOk(
        await CreatePage({ name, displayName, category: "pages.shop" }),
        "CreatePage",
      );
    }
    expectOk(
      await CreateResource({
        name: "ticket",
        fields: [{ name: "title", dataType: { $dataType: "string" } }],
      }),
      "CreateResource",
    );
  });

  after(() => destroyFixture());

  it("counts a block bound to it and a form sending to it, page by page", async function () {
    this.timeout(120_000);
    const board = expectOk(await GetPageStructure("/shop/board"), "board");
    expectOk(
      await SetPageBlocks(
        "/shop/board",
        {
          blocks: [
            {
              name: "tickets",
              type: "TableView",
              controller: "ticket",
              config: {},
            },
          ],
        },
        { expectedVersion: board.version },
      ),
      "SetPageBlocks board",
    );
    const intake = expectOk(await GetPageStructure("/shop/intake"), "intake");
    expectOk(
      await SetPageBlocks(
        "/shop/intake",
        {
          blocks: [
            {
              name: "newTicket",
              type: "Form",
              config: {
                submitUrl: "/api/ticket/new",
                submitUrlMethod: "POST",
                fields: [],
              },
            },
          ],
        },
        { expectedVersion: intake.version },
      ),
      "SetPageBlocks intake",
    );

    const readers = tableReaders().ticket ?? [];
    expect(readers.map((reader) => reader.page).sort()).to.deep.equal([
      "/shop/board",
      "/shop/intake",
    ]);
    expect(readers.find((reader) => reader.page === "/shop/board")).to.include({
      displayName: "Board",
      blocks: 1,
    });
  });

  it("says what deleting a page takes, and which pages still point at it", async function () {
    this.timeout(120_000);
    const quiet = expectOk(await GetPageStructure("/shop/quiet"), "quiet");
    expectOk(
      await SetPageBlocks(
        "/shop/quiet",
        {
          blocks: [
            {
              name: "goBoard",
              type: "Banner",
              config: {
                title: "See the board",
                actions: [{ label: "Open", to: "/shop/board" }],
              },
            },
          ],
        },
        { expectedVersion: quiet.version },
      ),
      "SetPageBlocks quiet",
    );

    const impact = pageImpact("/shop/board");
    expect(impact?.blocks).to.equal(1);
    expect(impact?.linkedFrom).to.deep.equal([
      { page: "/shop/quiet", displayName: "Quiet" },
    ]);
    expect(pageImpact("/shop/nowhere")).to.equal(undefined);
  });

  it("counts a page calling one of the deleted page's routes as pointing at it", async function () {
    this.timeout(120_000);
    const intake = expectOk(await GetPageStructure("/shop/intake"), "intake");
    expectOk(
      await SetPageBlocks(
        "/shop/intake",
        {
          blocks: [
            {
              name: "boardOrders",
              type: "KpiCard",
              config: {
                title: "Orders",
                fetchUrl: "/dms/pages/shop/board/stats/orders",
              },
            },
          ],
        },
        { expectedVersion: intake.version },
      ),
      "SetPageBlocks intake",
    );

    expect(pageImpact("/shop/board")?.linkedFrom).to.deep.include({
      page: "/shop/intake",
      displayName: "Intake",
    });
  });
  it("counts the pages reading a table named like an Object.prototype member", async function () {
    this.timeout(120_000);
    const names = ["constructor"];
    for (const name of names) {
      expectOk(
        await CreateResource({
          name,
          fields: [{ name: "title", dataType: { $dataType: "string" } }],
        }),
        `CreateResource ${name}`,
      );
    }
    const odd = expectOk(await GetPageStructure("/shop/odd"), "odd");
    expectOk(
      await SetPageBlocks(
        "/shop/odd",
        {
          blocks: names.map((name) => ({
            name: `${name}View`,
            type: "TableView",
            controller: name,
            config: {},
          })),
        },
        { expectedVersion: odd.version },
      ),
      "SetPageBlocks odd",
    );

    const readers = tableReaders();
    for (const name of names) {
      expect(
        Object.getOwnPropertyDescriptor(readers, name)?.value,
        name,
      ).to.deep.equal([
        { page: "/shop/odd", displayName: "Odd", blocks: 1, queries: 0 },
      ]);
    }
  });

  it("binds a table by the name it was created with, as well as by its ref", async function () {
    this.timeout(120_000);
    const created = [
      ["myTicket", "my-ticket"],
      ["toString", "to-string"],
    ] as const;
    for (const [name, ref] of created) {
      const resource = expectOk(
        await CreateResource({
          name,
          fields: [{ name: "title", dataType: { $dataType: "string" } }],
        }),
        `CreateResource ${name}`,
      );
      expect(resource.ref).to.equal(ref);
    }
    const named = expectOk(await GetPageStructure("/shop/named"), "named");
    expectOk(
      await SetPageBlocks(
        "/shop/named",
        {
          blocks: created.map(([name]) => ({
            name: `${name}View`,
            type: "TableView",
            controller: name,
            config: {},
          })),
        },
        { expectedVersion: named.version },
      ),
      "SetPageBlocks named",
    );

    const readers = tableReaders();
    for (const [, ref] of created) {
      expect(
        Object.getOwnPropertyDescriptor(readers, ref)?.value,
        ref,
      ).to.deep.equal([
        { page: "/shop/named", displayName: "Named", blocks: 1, queries: 0 },
      ]);
    }
  });
});
