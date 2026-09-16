import { GetMetadata } from "@antelopejs/interface-core";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import { expect } from "chai";
import {
  CreateDataType,
  getDataTypeId,
} from "@antelopejs/interface-dms/base/data-types";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { DefaultDataCompareTypes } from "@antelopejs/interface-dms/base/data-types/compare-types";

const DATA_TYPE_IDS = {
  number: "number",
  string: "string",
  date: "date",
  boolean: "boolean",
  select: "select",
  price: "price",
  percentage: "percentage",
  email: "email",
  password: "password",
  url: "url",
  phone: "phone",
  rich_text: "rich_text",
  string_time: "string_time",
  file: "file",
} as const;

const SELECT_ITEMS = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
];

describe("[unit] interfaces/dms-base/data-types/default-types", () => {
  describe("registration", () => {
    it("registers NumberType under the 'number' id", () => {
      const instance = new DefaultDataTypes.NumberType();
      expect(getDataTypeId(instance)).to.equal(DATA_TYPE_IDS.number);
    });

    it("registers StringType under the 'string' id", () => {
      const instance = new DefaultDataTypes.StringType();
      expect(getDataTypeId(instance)).to.equal(DATA_TYPE_IDS.string);
    });

    it("creates a NumberType via CreateDataType", () => {
      const instance = CreateDataType(DATA_TYPE_IDS.number);
      expect(instance).to.be.instanceOf(DefaultDataTypes.NumberType);
    });

    it("creates a StringType via CreateDataType", () => {
      const instance = CreateDataType(DATA_TYPE_IDS.string);
      expect(instance).to.be.instanceOf(DefaultDataTypes.StringType);
    });

    it("throws on unknown data type id", () => {
      expect(() => CreateDataType("unknown-type-xyz")).to.throw();
    });
  });

  describe("NumberType", () => {
    it("validates a plain number", () => {
      const type = new DefaultDataTypes.NumberType();
      const parsed = type.getValidation().safeParse(42);
      expect(parsed.success).to.equal(true);
    });

    it("rejects a string value", () => {
      const type = new DefaultDataTypes.NumberType();
      const parsed = type.getValidation().safeParse("not-a-number");
      expect(parsed.success).to.equal(false);
    });

    it("enforces min when provided", () => {
      const type = new DefaultDataTypes.NumberType({ min: 10 });
      expect(type.getValidation().safeParse(5).success).to.equal(false);
      expect(type.getValidation().safeParse(10).success).to.equal(true);
    });

    it("enforces max when provided", () => {
      const type = new DefaultDataTypes.NumberType({ max: 100 });
      expect(type.getValidation().safeParse(101).success).to.equal(false);
      expect(type.getValidation().safeParse(100).success).to.equal(true);
    });
  });

  describe("StringType", () => {
    it("accepts a plain string", () => {
      const type = new DefaultDataTypes.StringType();
      expect(type.getValidation().safeParse("hello").success).to.equal(true);
    });

    it("rejects a non-string value", () => {
      const type = new DefaultDataTypes.StringType();
      expect(type.getValidation().safeParse(42).success).to.equal(false);
    });

    it("enforces minLength", () => {
      const type = new DefaultDataTypes.StringType({ minLength: 3 });
      expect(type.getValidation().safeParse("ab").success).to.equal(false);
      expect(type.getValidation().safeParse("abc").success).to.equal(true);
    });

    it("enforces maxLength", () => {
      const type = new DefaultDataTypes.StringType({ maxLength: 5 });
      expect(type.getValidation().safeParse("123456").success).to.equal(false);
      expect(type.getValidation().safeParse("12345").success).to.equal(true);
    });
  });

  describe("BooleanType", () => {
    it("accepts true and false", () => {
      const type = new DefaultDataTypes.BooleanType();
      expect(type.getValidation().safeParse(true).success).to.equal(true);
      expect(type.getValidation().safeParse(false).success).to.equal(true);
    });

    it("rejects a non-boolean value", () => {
      const type = new DefaultDataTypes.BooleanType();
      expect(type.getValidation().safeParse("true").success).to.equal(false);
      expect(type.getValidation().safeParse(1).success).to.equal(false);
    });
  });

  describe("EmailType", () => {
    it("accepts a valid email", () => {
      const type = new DefaultDataTypes.EmailType();
      expect(
        type.getValidation().safeParse("user@example.com").success,
      ).to.equal(true);
    });

    it("rejects an invalid email", () => {
      const type = new DefaultDataTypes.EmailType();
      expect(type.getValidation().safeParse("not-an-email").success).to.equal(
        false,
      );
    });
  });

  describe("UrlType", () => {
    it("accepts a valid url", () => {
      const type = new DefaultDataTypes.UrlType();
      expect(
        type.getValidation().safeParse("https://example.com").success,
      ).to.equal(true);
    });

    it("rejects a malformed url", () => {
      const type = new DefaultDataTypes.UrlType();
      expect(type.getValidation().safeParse("not a url").success).to.equal(
        false,
      );
    });
  });

  describe("SelectType", () => {
    it("accepts a value that is in the items list", () => {
      const type = new DefaultDataTypes.SelectType({ items: SELECT_ITEMS });
      expect(type.getValidation().safeParse("a").success).to.equal(true);
    });

    it("rejects a value that is not in the items list", () => {
      const type = new DefaultDataTypes.SelectType({ items: SELECT_ITEMS });
      expect(type.getValidation().safeParse("c").success).to.equal(false);
    });

    it("accepts an array when multiple=true", () => {
      const type = new DefaultDataTypes.SelectType({
        items: SELECT_ITEMS,
        multiple: true,
      });
      expect(type.getValidation().safeParse(["a", "b"]).success).to.equal(true);
    });

    it("rejects an array with unknown values when multiple=true", () => {
      const type = new DefaultDataTypes.SelectType({
        items: SELECT_ITEMS,
        multiple: true,
      });
      expect(type.getValidation().safeParse(["a", "c"]).success).to.equal(
        false,
      );
    });
  });

  describe("PhoneType", () => {
    it("accepts any string without requiredPrefix", () => {
      const type = new DefaultDataTypes.PhoneType();
      expect(type.getValidation().safeParse("0123456789").success).to.equal(
        true,
      );
    });

    it("requires a + prefix when requiredPrefix=true", () => {
      const type = new DefaultDataTypes.PhoneType({ requiredPrefix: true });
      expect(type.getValidation().safeParse("0123456789").success).to.equal(
        false,
      );
      expect(type.getValidation().safeParse("+33123456789").success).to.equal(
        true,
      );
    });
  });

  describe("PasswordType", () => {
    it("enforces minLength when provided", () => {
      const type = new DefaultDataTypes.PasswordType({ minLength: 8 });
      expect(type.getValidation().safeParse("short").success).to.equal(false);
      expect(type.getValidation().safeParse("longenough").success).to.equal(
        true,
      );
    });
  });

  describe("AddressType", () => {
    it("accepts a full valid address object", () => {
      const type = new DefaultDataTypes.AddressType();
      const result = type.getValidation().safeParse({
        streetName: "1 rue",
        city: "Paris",
        postalCode: "75000",
        countryCode: "FR",
      });
      expect(result.success).to.equal(true);
    });

    it("rejects an address with missing required fields", () => {
      const type = new DefaultDataTypes.AddressType();
      const result = type.getValidation().safeParse({
        streetName: "",
        city: "Paris",
        postalCode: "",
        countryCode: "FR",
      });
      expect(result.success).to.equal(false);
    });
  });

  describe("PriceType defaults", () => {
    it("extends NumberType and defaults min to 0", () => {
      const type = new DefaultDataTypes.PriceType();
      expect(type).to.be.instanceOf(DefaultDataTypes.NumberType);
      expect(type.getValidation().safeParse(-1).success).to.equal(false);
      expect(type.getValidation().safeParse(0).success).to.equal(true);
    });
  });

  describe("PercentageType defaults", () => {
    it("extends NumberType and bounds to [0, 1] by default", () => {
      const type = new DefaultDataTypes.PercentageType();
      expect(type.getValidation().safeParse(-0.01).success).to.equal(false);
      expect(type.getValidation().safeParse(0).success).to.equal(true);
      expect(type.getValidation().safeParse(1).success).to.equal(true);
      expect(type.getValidation().safeParse(1.01).success).to.equal(false);
    });
  });

  describe("RelationType filterOnly", () => {
    // A bare class with no @RegisterTable/@Model: reading its DataAPIMeta
    // yields an empty meta with no table, so the Foreign join can only
    // succeed (or, here, fail loudly) when the join path is actually reached.
    class UnregisteredController {}

    it("keeps the relation compare modes whether or not filterOnly is set", () => {
      const filtering = new DefaultDataTypes.RelationType({
        dataApiController: UnregisteredController as never,
        keyMapping: { label: "name", value: "_id" },
        filterOnly: true,
      });
      // The funnel still offers the relation filter operators.
      expect(filtering.compareModes).to.include(DefaultDataCompareTypes.Is);
      expect(filtering.compareModes).to.include(DefaultDataCompareTypes.IsNot);
      expect(filtering.defaultCompareMode).to.equal(DefaultDataCompareTypes.Is);
    });

    it("skips the Foreign join when filterOnly is set (raw scalar stays in /list)", () => {
      class Target {}
      const rel = new DefaultDataTypes.RelationType({
        dataApiController: UnregisteredController as never,
        keyMapping: { label: "name", value: "_id" },
        filterOnly: true,
      });

      // decorateField returns before touching the related controller metadata
      // or the Foreign decorator, so it never throws despite the unregistered
      // controller...
      expect(() =>
        rel.decorateField(Target.prototype, "procedureId", {}),
      ).to.not.throw();

      // ...and registers no foreign reference: the column stays a raw scalar.
      const meta = GetMetadata(Target, DataAPIMeta);
      expect(meta.fields.procedureId?.foreign).to.equal(undefined);
    });

    it("engages the Foreign join when filterOnly is not set", () => {
      class Target {}
      const rel = new DefaultDataTypes.RelationType({
        dataApiController: UnregisteredController as never,
        keyMapping: { label: "name", value: "_id" },
      });

      // The default path reads the related controller metadata and runs the
      // Foreign decorator, which throws here because the controller declares
      // no table/schema — proving the join machinery is reached (the very
      // machinery filterOnly bypasses).
      expect(() =>
        rel.decorateField(Target.prototype, "procedureId", {}),
      ).to.throw();
    });
  });

  describe("escapeRegex", () => {
    it("escapes regex special characters", () => {
      const escaped = DefaultDataCompareTypes.escapeRegex(
        "a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o",
      );
      expect(escaped).to.equal(
        "a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o",
      );
    });

    it("returns the same string if no special characters", () => {
      expect(DefaultDataCompareTypes.escapeRegex("abc123")).to.equal("abc123");
    });

    it("handles an empty string", () => {
      expect(DefaultDataCompareTypes.escapeRegex("")).to.equal("");
    });
  });
});
