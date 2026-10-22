/**
 * Controls set in one row read as one: a select trigger takes the text
 * field's size, 16px on a phone (where a text field keeps 16px so iOS does
 * not zoom) and the v2 scale from md, on the same line height, so both are
 * as tall.
 */
import { describe, expect, it } from "vitest";
import { formControlsTheme } from "../layers/dms-layout/app/theme/form-controls";

const textCompound = (size: string) =>
  formControlsTheme.input.compoundVariants.find(
    (compound) =>
      "fixed" in compound && compound.fixed === false && compound.size === size,
  )?.class;

describe("a select trigger beside a text field", () => {
  it("keeps the text field's 16px on a phone and its md size above", () => {
    const md = formControlsTheme.select.variants.size.md.base;
    expect(md).toContain("text-base/5");
    expect(md).toContain(textCompound("md"));
    expect(formControlsTheme.selectMenu.variants.size.md.base).toBe(md);
  });

  it("follows the text field at sm and xl too", () => {
    const { sm, xl } = formControlsTheme.select.variants.size;
    expect(sm.base).toContain("text-sm/4");
    expect(sm.base).toContain(textCompound("sm"));
    expect(xl.base).toContain("text-base/6");
    expect(xl.base).toContain(textCompound("xl"));
  });
});
