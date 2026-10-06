import { describe, expect, it } from "vitest";
import {
  addTags,
  invalidTags,
} from "../layers/dms-ui/app/build/composables/form/tagValues";

describe("tag values", () => {
  it("adds trimmed items once each, in order", () => {
    expect(addTags(["a"], [" b ", "a", "b", ""])).toEqual(["a", "b"]);
  });

  it("reads addresses in lower case, so case never repeats one", () => {
    expect(
      addTags(["ann@acme.io"], ["Ann@Acme.io", "BOB@acme.io"], {
        itemType: "email",
      }),
    ).toEqual(["ann@acme.io", "bob@acme.io"]);
  });

  it("stops at max", () => {
    expect(addTags(["a"], ["b", "c"], { max: 2 })).toEqual(["a", "b"]);
  });

  it("finds the items that are no address", () => {
    expect(invalidTags(["ann@acme.io", "nope", "x@y"], "email")).toEqual([
      "nope",
      "x@y",
    ]);
    expect(invalidTags(["nope"], "string")).toEqual([]);
    expect(invalidTags(["nope"], undefined)).toEqual([]);
  });
});
