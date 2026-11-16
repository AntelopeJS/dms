/**
 * A filter chip writes its value through the column's formatter, but a
 * filter's value need not have the column's shape: the tag typed against a
 * tags column is one text, which the tags formatter (drawing a list) cannot
 * write. The chip then shows the value as typed, not "—".
 */
import { describe, expect, it } from "vitest";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import { registerFieldTypes } from "../layers/dms-ui/app/entries/composables/data-types/registerFieldTypes";
import { formatFilterValue } from "../layers/dms-ui/app/entries/composables/table/utils/formatFilterValue";

const dataTypes = new Map<string, DataType>();
registerFieldTypes((dataType) => dataTypes.set(dataType.id, dataType));
dataTypes.set("code_name", {
  id: "code_name",
  formatter: { default: (value) => String(value).toUpperCase() },
});
const getDataType = (id: string) => dataTypes.get(id);

const columns = [
  { value: "tags", label: "Tags", type: { id: "tags" } },
  { value: "code", label: "Code", type: { id: "code_name" } },
];

const format = (
  accessorKey: string,
  value: Parameters<typeof formatFilterValue>[0]["value"],
) =>
  formatFilterValue(
    { accessorKey, mode: "array_contains_string", value },
    columns,
    getDataType,
    "en-GB",
  );

describe("a filter chip's value", () => {
  it("shows the tag typed against a tags column", () => {
    expect(format("tags", "vip")).toBe("vip");
  });

  it("keeps what the column's formatter writes", () => {
    expect(format("code", "fr-be")).toBe("FR-BE");
  });

  it("stays empty without a value", () => {
    expect(format("tags", undefined)).toBe("");
  });
});
