import { expect } from "chai";
import { ListCategories } from "../../../implementations/dms-builder";
import { createFixture, destroyFixture } from "./harness";

const SOURCE = `import { RegisterModule } from "@antelopejs/interface-dms/page";

const SHOP = "Shop";
const MODULE_TITLE = \`\${SHOP} module\`;
const displayName = "Shop pages";

RegisterModule({
  id: "shop",
  title: MODULE_TITLE,
  defaultCategory: { displayName },
});

export {};
`;

async function displayNameOf(ref: string): Promise<string | undefined> {
  const categories = await ListCategories();
  return categories.find((summary) => summary.ref === ref)?.displayName;
}

/**
 * A module's `title` and `defaultCategory.displayName` written as constants:
 * `ListCategories` reports the values they hold, not the ids.
 */
describe("module category names written as constants", () => {
  before(function () {
    this.timeout(120_000);
    const app = createFixture();
    app.write("index.ts", SOURCE);
  });

  after(() => destroyFixture());

  it("read the module title as the value its constant holds", async () => {
    expect(await displayNameOf("modules.shop")).to.equal("Shop module");
  });

  it("read the default category name as the value its constant holds", async () => {
    expect(await displayNameOf("modules.shop.pages")).to.equal("Shop pages");
  });
});
