import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import {
  CreateCategory,
  CreatePage,
} from "../../../implementations/dms-builder";
import { DEFAULT_COMPILER_OPTIONS } from "../../../implementations/dms-builder/engine";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const OP_TIMEOUT = 120_000;

/**
 * Valid only against the `@types/node` 26 this package installs: its
 * `Readable` declarations name `IteratorObject`, which a compiler older than
 * TypeScript 5.6 cannot read, so an older checker rejects the overload.
 */
const READLINE_SOURCE = `import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const child = spawn("node", ["--version"]);
for (const input of [child.stdout, child.stderr]) {
  if (input) {
    createInterface({ input }).on("line", () => undefined);
  }
}
`;

let app: Fixture;

/**
 * The builder typechecks every save. A project on the current TypeScript and
 * `@types/node` must save as its own `tsc` would accept it, with the DMS
 * template's compiler options.
 */
describe("a project on @types/node 26", () => {
  before(() => {
    app = createFixture();
    fs.writeFileSync(
      path.join(app.root, "tsconfig.json"),
      `${JSON.stringify({
        compilerOptions: {
          ...DEFAULT_COMPILER_OPTIONS,
          skipLibCheck: true,
          preserveSymlinks: true,
          declaration: false,
          rootDir: "src",
        },
        include: ["src/**/*.ts"],
      })}\n`,
    );
    app.write("capture.ts", READLINE_SOURCE);
    app.write("index.ts", 'import "./capture";\n\nexport {};\n');
  });

  after(() => {
    destroyFixture();
  });

  it("saves a new category and a page in it", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "CreateCategory",
    );
    const created = expectOk(
      await CreatePage({
        name: "orders",
        displayName: "Orders",
        category: "pages.shop",
      }),
      "CreatePage",
    );
    expect(created.ref).to.equal("/shop/orders");
    expect(app.exists("orders/page.ts")).to.equal(true);
  });
});
