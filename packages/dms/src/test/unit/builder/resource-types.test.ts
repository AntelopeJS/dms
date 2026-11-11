import { expect } from "chai";
import type { FieldSpec } from "@antelopejs/interface-dms-builder";
import {
  AddField,
  CreateResource,
  GetCatalog,
} from "../../../implementations/dms-builder";
import { mappedDbType } from "../../../implementations/dms-builder/engine/resource-emit";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const MODEL_FILE = "asset/database.ts";
const OP_TIMEOUT = 60_000;

let app: Fixture;

async function added(field: FieldSpec): Promise<string[]> {
  const result = await AddField("asset", field);
  expectOk(result, `AddField ${field.name}`);
  return result.ok ? (result.warnings ?? []).map((entry) => entry.code) : [];
}

/**
 * A field's column follows from its DataType. One the builder cannot map is
 * stored as a string and says so; every built-in one is mapped, so the warning
 * is kept for a DataType a project registered itself — where it is true.
 */
describe("the column a DataType is stored in", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    expectOk(
      await CreateResource({
        name: "asset",
        fields: [{ name: "title", dataType: { $dataType: "string" } }],
      }),
      "CreateResource",
    );
  });

  after(() => destroyFixture());

  it("maps every DataType the DMS registers", async () => {
    const unmapped = (await GetCatalog()).dataTypes
      .map((entry) => entry.id)
      .filter((id) => !mappedDbType({ $dataType: id }));
    expect(unmapped).to.deep.equal([]);
  });

  it("stores a status as the checkbox it is", () => {
    expect(mappedDbType({ $dataType: "status" })).to.deep.equal({
      field: "boolean",
      ts: "boolean",
    });
  });

  it("stores a time of day as the number of seconds it validates", async function () {
    this.timeout(OP_TIMEOUT);
    const warnings = await added({
      name: "opensAt",
      dataType: { $dataType: "string_time" },
    });

    expect(warnings).to.not.include("datatype_fallback");
    expect(app.read(MODEL_FILE)).to.contain(
      '@Field("number") declare opensAt: number;',
    );
  });

  it("stores a list of files as it is, typed as a list", async function () {
    this.timeout(OP_TIMEOUT);
    const warnings = await added({
      name: "attachments",
      dataType: { $dataType: "file", config: { multiple: true } },
    });

    expect(warnings).to.not.include("datatype_fallback");
    expect(app.read(MODEL_FILE)).to.contain(
      '@Field("any") declare attachments: Record<string, unknown>[];',
    );
  });

  it("leaves a DataType nobody mapped to the string fallback", () => {
    expect(mappedDbType({ $dataType: "made_up" })).to.equal(undefined);
  });

  for (const id of ["constructor", "toString", "hasOwnProperty", "valueOf"]) {
    it(`leaves a DataType named ${id} to the string fallback`, () => {
      expect(mappedDbType({ $dataType: id })).to.equal(undefined);
    });
  }
});
