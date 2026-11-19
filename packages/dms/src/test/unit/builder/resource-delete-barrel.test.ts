import path from "node:path";
import { expect } from "chai";
import {
  CreateResource,
  DeleteResource,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

let app: Fixture;

describe("deleting a resource on Windows paths", () => {
  before(function () {
    this.timeout(120_000);
    app = createFixture();
  });

  after(() => destroyFixture());

  it("removes the barrel's export of the resource", async function () {
    this.timeout(120_000);
    expectOk(
      await CreateResource({
        name: "customer",
        displayName: "Customer",
        fields: [
          { name: "name", label: "Name", dataType: { $dataType: "string" } },
        ],
      }),
      "CreateResource customer",
    );
    const barrel = ["index.ts"].find((file) => app.exists(file));
    expect(barrel, "a root barrel exports the resource").to.be.a("string");
    expect(app.read(barrel!)).to.contain("customer");

    const join = path.join;
    path.join = (...parts: string[]) =>
      parts.at(-1) === "index.ts" ? path.win32.join(...parts) : join(...parts);
    try {
      expectOk(await DeleteResource("customer"), "DeleteResource customer");
    } finally {
      path.join = join;
    }

    expect(app.read(barrel!)).to.not.contain("customer");
  });
});
