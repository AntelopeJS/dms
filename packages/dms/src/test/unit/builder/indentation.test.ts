import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import { AddBlock } from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const HOME_FILE = "home.ts";

/** The entry of template-dms: imports only, so not one line of it is indented. */
const INDEX_SOURCE = `import "./home";

export function construct(): void {}

export async function start(): Promise<void> {}
`;

/** The page template-dms ships, indented with two spaces as its oxfmt preset writes. */
const HOME_SOURCE = `import { Banner } from "@antelopejs/interface-dms/base";
import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";

@RegisterPage()
export class PageHome extends PageController("home", {
  displayName: "Home",
  icon: "i-ph-house",
  category: pagesCategory,
  order: 0,
  description: "Connect a database or build your own pages",
}) {
  static start = Banner({
    tone: "primary",
    icon: "i-ph-plugs-connected",
    title: "Start here",
  });
}
`;

const OP_TIMEOUT = 60_000;

describe("[unit] the indentation of a block added to a project without an .editorconfig", () => {
  let app: Fixture;

  before(() => {
    app = createFixture();
    fs.rmSync(path.join(app.root, ".editorconfig"));
    app.write("index.ts", INDEX_SOURCE);
    app.write(HOME_FILE, HOME_SOURCE);
  });

  after(() => destroyFixture());

  it("follows the two spaces of the project's sources when its entry has no indented line", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddBlock({
        page: "/home",
        name: "next",
        type: "Banner",
        config: { title: "Next" },
      }),
      "AddBlock",
    );
    const indents = app
      .read(HOME_FILE)
      .split("\n")
      .filter((line) => line.includes("static "))
      .map((line) => /^\s*/.exec(line)?.[0]);
    expect(indents).to.deep.equal(["  ", "  "]);
  });
});
