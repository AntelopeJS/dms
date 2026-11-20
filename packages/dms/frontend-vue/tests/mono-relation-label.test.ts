import { describe, expect, it, vi } from "vitest";
import { registerMetricCellTypes } from "../layers/dms-ui/app/build/composables/data-types/metricCells";
import { isObject } from "#dms-core/app/utils/type-check";
import type {
  DataType,
  DataTypeFormatter,
} from "#dms-core/app/composables/data-types/useDataType";

function monoFormatter() {
  let mono: DataType | undefined;
  registerMetricCellTypes((dataType) => {
    if (dataType.id === "mono") mono = dataType;
  });
  const format = mono?.formatter?.default;
  if (!format) throw new Error("mono data type missing");
  return format;
}

const valueOf = (node: ReturnType<DataTypeFormatter>): string => {
  if (!isObject(node) || node === null) throw new Error("not a vnode");
  const { props } = node;
  if (!isObject(props) || props === null) throw new Error("no props");
  return String(props.value);
};

describe("mono relation cell", () => {
  it("shows the related record's label, not [object Object]", () => {
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    const format = monoFormatter();
    const options = { typeOptions: { keyMapping: { label: "title" } } };
    expect(
      valueOf(format({ _id: "1", title: "Order 42" }, "en", options, {})),
    ).toBe("Order 42");
    expect(
      valueOf(
        format(
          [
            { _id: "1", title: "A" },
            { _id: "2", title: "B" },
          ],
          "en",
          options,
          {},
        ),
      ),
    ).toBe("A, B");
    expect(valueOf(format("plain-id", "en", {}, {}))).toBe("plain-id");
  });
});
