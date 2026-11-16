import { expect } from "chai";
import {
  ConfigureField,
  CreateResource,
  RemoveField,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const OP_TIMEOUT = 60_000;
const DATA_API_FILE = "ledger/data-api.ts";

let app: Fixture;

/**
 * The app compiles with `noUnusedLocals`, so a save that leaves a decorator
 * import nothing reads fails on `typecheck_failed`.
 */
describe("the imports a field operation leaves behind", () => {
  beforeEach(async function () {
    this.timeout(120_000);
    app = createFixture({ compilerOptions: { noUnusedLocals: true } });
    expectOk(
      await CreateResource({
        name: "ledger",
        fields: [
          {
            name: "memo",
            dataType: { $dataType: "string" },
            sortable: true,
            filterable: true,
            searchable: true,
          },
        ],
      }),
      "CreateResource",
    );
  });

  afterEach(() => destroyFixture());

  it("drops the decorators a removed field alone used", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await RemoveField("ledger#memo"), "RemoveField");
    const written = app.read(DATA_API_FILE);
    expect(written).to.not.contain("declare memo");
    for (const name of ["Column", "Optional", "DefaultDataTypes"]) {
      expect(written, name).to.not.match(new RegExp(`\\b${name}\\b`));
    }
  });

  it("drops the decorators a configured field no longer uses", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigureField("ledger#memo", {
        sortable: false,
        filterable: false,
        searchable: false,
      }),
      "ConfigureField",
    );
    const written = app.read(DATA_API_FILE);
    expect(written).to.contain("declare memo");
    for (const name of ["Searchable", "Sortable"]) {
      expect(written, name).to.not.match(new RegExp(`\\b${name}\\b`));
    }
  });
});
