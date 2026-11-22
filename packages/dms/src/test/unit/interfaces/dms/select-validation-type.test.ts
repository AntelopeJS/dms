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

/**
 * A select whose items are read from a column accepts any text, and one listing its items only
 * those. An implementation that widens or narrows the published return type of `getValidation()`
 * fails to compile here; one that validates a referenced select against its empty `items` fails
 * the run.
 */
describe("[unit] a select's validation", () => {
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
