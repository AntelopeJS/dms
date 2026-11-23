/**
 * An address cell writes the postal code and the city as one part, the way
 * an address is written on an envelope ("75001 Paris").
 *
 * @packageDocumentation
 */
import { h } from "vue";
import { beforeAll, expect, it, vi } from "vitest";
import { isObject } from "../layers/dms-core/app/utils/type-check";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";

let formatAddress: NonNullable<DataType["formatter"]>["default"];

beforeAll(async () => {
  vi.stubGlobal("h", h);
  vi.stubGlobal("isObject", isObject);
  for (const name of [
    "formatNumber",
    "formatPrice",
    "formatPercentage",
    "formatDate",
    "getBooleanLabel",
  ]) {
    vi.stubGlobal(name, () => "");
  }
  vi.stubGlobal("useDmsApp", () => ({
    $i18n: {
      t: (key: string) => (key === "country.FR" ? "France" : key),
      locale: { value: "fr" },
    },
  }));
  vi.stubGlobal("useDataTypes", () => ({
    registerDataType: (dataType: DataType) => {
      if (dataType.id === "address" && dataType.formatter?.default)
        formatAddress = dataType.formatter.default;
    },
  }));
  const { registerDefaultDataTypes } = await import(
    "../layers/dms-ui/app/entries/composables/data-types/registerDefaults"
  );
  registerDefaultDataTypes();
});

it("joins the postal code and the city with a space, not a comma", () => {
  const address = {
    streetName: "Rue de Rivoli",
    houseNumber: "12",
    postalCode: "75001",
    city: "Paris",
    countryCode: "FR",
  };
  expect(formatAddress(address, "fr", {}, {})).toBe(
    "Rue de Rivoli 12, 75001 Paris, France",
  );
});

it("keeps the city alone when the address has no postal code", () => {
  expect(formatAddress({ city: "Paris" }, "fr", {}, {})).toBe("Paris");
});
