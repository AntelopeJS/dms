/**
 * The text and the path readers of a data type value: a record reads as its
 * JSON where `String` wrote `[object Object]`, anything else as `String`
 * writes it, and a dotted path reads a row the way @nuxt/ui's `get` does.
 */
import { describe, expect, it } from "vitest";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import {
  readFieldPath,
  textOf,
} from "../layers/dms-core/app/entries/utils/dataTypeValue";

const LOCALIZED = { en: "Admin", fr: "Administrateur" };
const LOCALIZED_TEXT = JSON.stringify(LOCALIZED);

describe("textOf", () => {
  it("writes a row, or a list holding one, as its JSON", () => {
    expect(textOf(LOCALIZED)).toBe(LOCALIZED_TEXT);
    expect(textOf([LOCALIZED])).toBe(`[${LOCALIZED_TEXT}]`);
  });

  it("writes anything else the way String does", () => {
    const date = new Date("2026-11-16T10:00:00Z");
    for (const value of [
      "text",
      0,
      false,
      null,
      undefined,
      date,
      ["a", 1, null],
    ]) {
      expect(textOf(value)).toBe(String(value));
    }
  });
});

describe("readFieldPath", () => {
  it("reads the paths @nuxt/ui's get reads", () => {
    const row = { customer: { name: "Ada" }, lines: [{ total: 3 }], 1: "one" };
    for (const path of ["customer.name", "lines.0.total", "1", "missing.x"]) {
      expect(readFieldPath(row, path)).toEqual(get(row, path));
    }
  });

  it("reads no member of a text or a list beyond its items", () => {
    expect(readFieldPath({ tags: ["a"], name: "Ada" }, "tags.length")).toBe(
      undefined,
    );
    expect(readFieldPath({ name: "Ada" }, "name.length")).toBe(undefined);
  });
});
