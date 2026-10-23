import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  ModelReference,
} from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  LocalizationModifier,
  Localized,
  Model,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { adaptFieldValidationSchema } from "@antelopejs/interface-dms/base/form-schema";
import type { FormField } from "@antelopejs/interface-dms/base/form-types";
import {
  Column,
  TableViewMeta,
} from "@antelopejs/interface-dms/base/table-view/meta";
import { TableViewRoutes } from "@antelopejs/interface-dms/base/table-view/routes";
import { GetMetadata } from "@antelopejs/interface-core";
import { z } from "zod";

const SCHEMA = "form-fallback-locale-test";
const TABLE = "ranges";

@RegisterTable(TABLE, SCHEMA)
class Range extends Table.with(LocalizationModifier) {
  @Localized({ fallbackLocale: "en" })
  @Field("string")
  declare name: string;
  @Localized()
  @Field("string")
  declare note: string;
  @Field("string")
  declare code: string;
}
class RangeModel extends BasicDataModel(Range, TABLE) {}

@RegisterDataController()
class RangeAPI extends DataController(
  Range,
  TableViewRoutes.All,
  Controller("/form-fallback-locale-test"),
) {
  @ModelReference()
  @Model(RangeModel)
  declare model: RangeModel;

  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Column({ name: "Note", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare note: string;

  @Column({ name: "Code", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare code: string;
}

function formFields(): Map<string, FormField> {
  const fields = GetMetadata(RangeAPI, TableViewMeta).getFormFields(
    "new",
  ) as FormField[];
  return new Map(fields.map((field) => [field.id, field]));
}

/**
 * A localized column's fallback language is required in its generated form
 * as soon as any language is filled: the form learns it from `@Localized`,
 * and the server refuses a value missing it.
 */
describe("[unit] interfaces/dms-base/form-fallback-locale — the fallback language of a localized field", () => {
  it("gives a localized field the fallback locale its column declares", () => {
    expect(formFields().get("name")?.fallbackLocale).to.equal("en");
    expect(formFields().get("note")?.fallbackLocale).to.equal(undefined);
    expect(formFields().get("code")?.fallbackLocale).to.equal(undefined);
  });

  it("refuses a value filling another language but not the fallback one", () => {
    const schema = adaptFieldValidationSchema(z.string(), {
      localized: true,
      fallbackLocale: "en",
    });
    const refused = schema.safeParse({ en: " ", fr: "Gamme" });
    expect(refused.success).to.equal(false);
    expect(refused.error?.issues.map(({ path }) => path)).to.deep.equal([
      ["en"],
    ]);
    expect(schema.safeParse({ en: "Range", fr: "" }).success).to.equal(true);
    expect(schema.safeParse({ en: "", fr: "" }).success).to.equal(true);
    expect(schema.safeParse(null).success).to.equal(true);
  });
});
