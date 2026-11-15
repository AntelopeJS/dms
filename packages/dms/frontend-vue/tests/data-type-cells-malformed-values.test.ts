import { h } from "vue";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { isObject } from "../layers/dms-core/app/utils/type-check";
import { changedFormKeys } from "../layers/dms-ui/app/entries/composables/unsaved-changes/formValue";
import { renderIdentity } from "../layers/dms-ui/app/build/composables/data-types/defaultIdentityCells";
import { childOf } from "../layers/dms-ui/app/entries/composables/data-types/cellHelpers";

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
    expect(childOf({ a: 1 })).toBe("[object Object]");
    expect(childOf(["a", { a: 1 }])).toEqual(["a", "[object Object]"]);
  });
});

describe("a date cell given a value that is no date", () => {
  beforeAll(() => {
    vi.stubGlobal("isObject", isObject);
    vi.stubGlobal("useDmsApp", () => ({
      $i18n: { t: (key: string) => key, locale: { value: "en" } },
    }));
  });

  it("writes it as it is, where a date or a timestamp is read as one", async () => {
    const { renderRelativeDate } = await import(
      "../layers/dms-ui/app/build/composables/data-types/defaultDateCells"
    );
    expect(renderRelativeDate(true, "en", {}, {})).toBe("true");
  });
});

describe("an identity cell given a malformed avatar", () => {
  beforeAll(() => {
    vi.stubGlobal("h", h);
    vi.stubGlobal("isObject", isObject);
    vi.stubGlobal("useDmsApp", () => ({
      $i18n: { t: (key: string) => key, locale: { value: "en" } },
    }));
  });

  const avatarOf = (field: unknown) =>
    renderIdentity("Ada", { avatarField: "avatar" }, { avatar: field }).props
      ?.avatar;

  it("draws no avatar for a file key that is no text", () => {
    expect(avatarOf({ key: 5 })).toBeUndefined();
  });

  it("keeps the file of a text key", () => {
    expect(avatarOf({ key: "avatars/ada.png" })).toEqual({
      key: "avatars/ada.png",
    });
  });
});
