import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import { AddBlock } from "../../../implementations/dms-builder";
import { createFixture, destroyFixture, expectOk, TSCONFIG } from "./harness";

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

/**
 * The indentation of each static block of the home page after one is added to
 * an app with no `.editorconfig`, written with these sources and the extra
 * `files` its tsconfig lists.
 */
async function blockIndents(
  home: string,
  files?: string[],
): Promise<(string | undefined)[]> {
  const app = createFixture();
  fs.rmSync(path.join(app.root, ".editorconfig"));
  fs.writeFileSync(
    path.join(app.root, "tsconfig.json"),
    JSON.stringify({ ...TSCONFIG, files }),
  );
  app.write("index.ts", INDEX_SOURCE);
  app.write(HOME_FILE, home);
  expectOk(
    await AddBlock({
      page: "/home",
      name: "next",
      type: "Banner",
      config: { title: "Next" },
    }),
    "AddBlock",
  );
  return app
    .read(HOME_FILE)
    .split("\n")
    .filter((line) => line.includes("static "))
    .map((line) => /^\s*/.exec(line)?.[0]);
}

describe("[unit] the indentation of a block added to a project without an .editorconfig", () => {
  afterEach(() => destroyFixture());

  it("follows the two spaces of the project's sources when its entry has no indented line", async function () {
    this.timeout(OP_TIMEOUT);
    expect(await blockIndents(HOME_SOURCE)).to.deep.equal(["  ", "  "]);
  });

  it("follows tabs when the first source opens with a doc comment", async function () {
    this.timeout(OP_TIMEOUT);
    const tabbed = HOME_SOURCE.replace(/^ {4}/gm, "\t\t").replace(
      /^ {2}/gm,
      "\t",
    );
    const home = `/**\n * The home page of the app.\n */\n${tabbed}`;
    expect(await blockIndents(home)).to.deep.equal(["\t", "\t"]);
  });

  it("skips a file the tsconfig lists that is not on disk yet", async function () {
    this.timeout(OP_TIMEOUT);
    expect(
      await blockIndents(HOME_SOURCE, ["src/generated/env.d.ts"]),
    ).to.deep.equal(["  ", "  "]);
  });
});
