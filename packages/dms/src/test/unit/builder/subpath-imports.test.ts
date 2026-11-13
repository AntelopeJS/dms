import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import {
  GetPageStructure,
  ListPages,
  SetPageBlocks,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const OP_TIMEOUT = 60_000;
const PAGE_FILE = "cockpit/page.ts";

/**
 * A page written the way the DMS documentation writes one: every factory from
 * its own subpath rather than from the `base` barrel, plus a component made by
 * a local helper the catalog has no factory for.
 */
const PAGE_SOURCE = `import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { KpiCard } from "@antelopejs/interface-dms/base/kpi-card";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";

function pinnedCard(title: string) {
  return KpiCard({ title });
}

@RegisterPage()
export class CockpitPage extends PageController(
  "cockpit",
  { displayName: "Cockpit", category: pagesCategory },
  DefaultLayout(),
) {
  static revenue = KpiCard({ title: "Revenue" });

  static row = Grid({ gap: "1rem" }).child("pinned", pinnedCard("Pinned"));

  static headline = pinnedCard("Headline");

  static apiPath = "/api/cockpit";
}
`;

let app: Fixture;
let ref: string;

describe("a page importing its blocks from subpaths", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    fs.mkdirSync(path.join(app.root, "src", "cockpit"));
    app.write(PAGE_FILE, PAGE_SOURCE);
    app.write("index.ts", 'import "./cockpit/page";\n\nexport {};\n');
    const page = (await ListPages()).find((entry) =>
      entry.ref.endsWith("cockpit"),
    );
    expect(page, "the hand-written page is listed").to.not.equal(undefined);
    ref = page!.ref;
  });

  after(() => destroyFixture());

  it("reads each subpath factory as its catalog block", async function () {
    this.timeout(OP_TIMEOUT);
    const { blocks } = expectOk(
      await GetPageStructure(ref),
      "GetPageStructure",
    );
    const revenue = blocks.find((block) => block.name === "revenue");
    expect(revenue).to.include({ type: "KpiCard", editable: true });
    expect(revenue?.config).to.deep.equal({ title: "Revenue" });
    expect(blocks.find((block) => block.name === "row")?.type).to.equal("Grid");
  });

  it("reports a component it has no factory for as opaque, not absent", async function () {
    this.timeout(OP_TIMEOUT);
    const { blocks } = expectOk(
      await GetPageStructure(ref),
      "GetPageStructure",
    );
    expect(blocks.map((block) => block.name)).to.deep.equal([
      "revenue",
      "row",
      "headline",
    ]);
    const headline = blocks.find((block) => block.name === "headline");
    expect(headline).to.include({ type: null, editable: false });
    expect(headline?.opaqueReason).to.be.a("string");
    const row = blocks.find((block) => block.name === "row");
    expect(row?.children?.map((child) => child.name)).to.deep.equal(["pinned"]);
    expect(row?.children?.[0]).to.include({ type: null, editable: false });
  });

  it("keeps the subpath imports and the opaque blocks through a save", async function () {
    this.timeout(OP_TIMEOUT);
    const before = expectOk(await GetPageStructure(ref), "GetPageStructure");
    expectOk(
      await SetPageBlocks(
        ref,
        {
          blocks: [
            {
              name: "revenue",
              type: "KpiCard",
              config: { title: "Revenue this month" },
            },
            { name: "row", preserve: true },
            { name: "headline", preserve: true },
          ],
        },
        { expectedVersion: before.version },
      ),
      "SetPageBlocks",
    );

    const source = app.read(PAGE_FILE);
    expect(source).to.contain('KpiCard({ title: "Revenue this month" })');
    expect(source).to.contain('.child("pinned", pinnedCard("Pinned"))');
    expect(source).to.contain('static headline = pinnedCard("Headline");');
    expect(source).to.contain('static apiPath = "/api/cockpit";');
    expect(source).to.contain(
      'import { KpiCard } from "@antelopejs/interface-dms/base/kpi-card";',
    );
    expect(source).to.not.match(/from "@antelopejs\/interface-dms\/base";/);
  });
});
