import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { mockupTool, run } from "../../helpers/mockup-mcp";
import {
  CONNECTION,
  ORDERS,
  WrittenSchema,
  connectDatabase,
  createOpsCategory,
  valueFree,
} from "./helpers/mapped-orders";
import { MODULE, OP_TIMEOUT } from "./mapped-database";

function inCategory(category: string): JsonValue {
  return {
    module: MODULE,
    connection: CONNECTION,
    resources: [
      {
        relation: ORDERS,
        category,
        tableView: true,
        writable: false,
        fields: [{ column: "id" }, { column: "total" }],
      },
    ],
  };
}

describe("[unit] builder_map_resources with a category", function () {
  this.timeout(OP_TIMEOUT);

  connectDatabase();

  it("writes the page in the category a resource sends, and refuses one that does not exist", async () => {
    await createOpsCategory();
    await valueFree("builder_create_category", {
      name: "sales",
      displayName: "Sales",
      module: MODULE,
    });
    const refused = await run(
      mockupTool("builder_map_resources"),
      inCategory("pages.nowhere"),
    );
    expect(refused.isError).to.equal(true);
    expect(refused.text).to.include("erp.orders");
    expect(refused.text).to.include("pages.nowhere");
    const foreign = await run(
      mockupTool("builder_map_resources"),
      inCategory("pages.ops"),
    );
    expect(foreign.isError).to.equal(true);
    expect(foreign.text).to.include("erp.orders");
    expect(foreign.text).to.include(MODULE);
    const written = WrittenSchema.parse(
      JSON.parse(
        await valueFree("builder_map_resources", inCategory("pages.sales")),
      ),
    );
    expect(written.data.resources[0].page).to.equal("/sales/erp-orders");
  });
});
