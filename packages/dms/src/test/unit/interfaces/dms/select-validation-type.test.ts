import { expect } from "chai";
import type { z } from "zod";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";

/** The return type `SelectType.getValidation()` publishes; a change to it is a change of the interface's API. */
type PublishedSelectValidation =
  | z.ZodNever
  | z.ZodEnum<Record<string, string>>
  | z.ZodArray<z.ZodNever | z.ZodEnum<Record<string, string>>>
  | z.ZodString
  | z.ZodArray<z.ZodString>;

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const pinned: Same<
  ReturnType<DefaultDataTypes.SelectType["getValidation"]>,
  PublishedSelectValidation
> = true;

describe("[unit] a select's validation accepts any text when a column holds its items, and only its items otherwise (fails to compile when the published `getValidation()` type widens or narrows)", () => {
  it("accepts any text when its items are read from a column, and only its items otherwise", () => {
    expect(pinned).to.equal(true);
    const referenced = new DefaultDataTypes.SelectType({
      items: [],
      itemsFrom: { column: "status" },
    }).getValidation();
    expect(referenced.safeParse("zq_paid").success).to.equal(true);
    const listed = new DefaultDataTypes.SelectType({
      items: [{ label: "Paid", value: "paid" }],
    }).getValidation();
    expect(listed.safeParse("paid").success).to.equal(true);
    expect(listed.safeParse("zq_paid").success).to.equal(false);
  });
});
