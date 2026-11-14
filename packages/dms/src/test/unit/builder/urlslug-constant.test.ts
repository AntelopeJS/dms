import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import { ListPages } from "../../../implementations/dms-builder";
import { createFixture, destroyFixture, type Fixture } from "./harness";

const SOURCE = `import { Placeholder } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  Category,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";

const BOARD_SLUG = "shop";
const OVERVIEW_SLUG = "main";

export const boardCategory = Category("board", {
  urlSlug: BOARD_SLUG,
  category: pagesCategory,
});

@RegisterPage()
export class BoardPage extends PageController(
  "overview",
  { urlSlug: OVERVIEW_SLUG, category: boardCategory },
  DefaultLayout({ fullWidth: true }),
) {
  static placeholder = Placeholder({ label: "Board" });
}
`;

let app: Fixture;

/**
 * A category's and a page's `urlSlug` written as constants: the page lists
 * under the slugs the constants hold, not under the ids.
 */
describe("urlSlug written as a constant", () => {
  before(function () {
    this.timeout(120_000);
    app = createFixture();
    fs.mkdirSync(path.join(app.root, "src", "board"));
    app.write("board/page.ts", SOURCE);
    app.write("index.ts", 'import "./board/page";\n\nexport {};\n');
  });

  after(() => destroyFixture());

  it("lists the page under the constants' slugs", async () => {
    const refs = (await ListPages()).map((page) => page.ref);
    expect(refs).to.include("/shop/main");
    expect(refs).to.not.include("/board/overview");
  });
});
