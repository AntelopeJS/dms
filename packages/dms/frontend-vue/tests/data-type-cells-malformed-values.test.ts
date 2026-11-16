import { h } from "vue";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { isObject } from "../layers/dms-core/app/utils/type-check";
import { changedFormKeys } from "../layers/dms-ui/app/entries/composables/unsaved-changes/formValue";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import {
  childOf,
  readSubline,
} from "../layers/dms-ui/app/entries/composables/data-types/cellHelpers";

describe("changedFormKeys reads own keys only", () => {
  it("finds a field named like an Object.prototype member unchanged while both sides hold nothing for it", () => {
    expect(changedFormKeys({ constructor: "" }, {}, ["constructor"])).toEqual(
      [],
    );
  });

  it("finds that field changed once a side holds a value for it", () => {
    expect(
      changedFormKeys({ constructor: "typed" }, {}, ["constructor"]),
    ).toEqual(["constructor"]);
  });
});

describe("a value drawn as a child of a cell", () => {
  it("keeps nodes, text, numbers and flags and writes any other value as text", () => {
    const node = h("span");
    expect(childOf(node)).toBe(node);
    expect(childOf("a")).toBe("a");
    expect(childOf(3)).toBe(3);
    expect(childOf(null)).toBeNull();
    expect(childOf({ a: 1 })).toBe('{"a":1}');
    expect(childOf(["a", { a: 1 }])).toEqual(["a", '{"a":1}']);
  });
});

const registered = new Map<string, DataType["formatter"]>();

function formatterOf(
  id: string,
): NonNullable<DataType["formatter"]>["default"] {
  const formatter = registered.get(id)?.default;
  if (!formatter) throw new Error(`No formatter registered for ${id}`);
  return formatter;
}

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
    $i18n: { t: (key: string) => key, locale: { value: "en" } },
  }));
  vi.stubGlobal("useDataTypes", () => ({
    registerDataType: (dataType: DataType) =>
      registered.set(dataType.id, dataType.formatter),
  }));
  const { registerDefaultDataTypes } = await import(
    "../layers/dms-ui/app/entries/composables/data-types/registerDefaults"
  );
  registerDefaultDataTypes();
});

describe("a date cell given a value that is no date", () => {
  it("writes it as it is, where a date or a timestamp is read as one", () => {
    expect(formatterOf("relative_date")(true, "en", {}, {})).toBe("true");
  });
});

describe("an identity cell given a malformed avatar", () => {
  const avatarOf = (field: { key: string | number }) => {
    const cell = formatterOf("identity")(
      "Ada",
      "en",
      { avatarField: "avatar" },
      { avatar: field },
    );
    return isObject(cell) && isObject(cell.props)
      ? cell.props.avatar
      : undefined;
  };

  it("draws no avatar for a file key that is no text", () => {
    expect(avatarOf({ key: 5 })).toBeUndefined();
  });

  it("keeps the file of a text key", () => {
    expect(avatarOf({ key: "avatars/ada.png" })).toEqual({
      key: "avatars/ada.png",
    });
  });
});

describe("an image cell given an image whose alt is no text", () => {
  it("draws no image", () => {
    expect(formatterOf("image")([{ key: "a.png", alt: 5 }], "en", {}, {})).toBe(
      "",
    );
  });
});

describe("an address cell given a part that is no text", () => {
  it("leaves the part out", () => {
    expect(
      formatterOf("address")(
        { streetName: "Rue", postalCode: "1000", city: true },
        "en",
        {},
        {},
      ),
    ).toBe("Rue, 1000");
  });
});

describe("a cell's secondary line whose text is no block text", () => {
  it("reads the row field as its text", () => {
    const reading = {
      processText: () => "processed",
      isStringTranslated: false,
    };
    expect(readSubline({ text: 5 }, reading)).toEqual({
      text: '{"text":5}',
      tone: undefined,
    });
  });
});
