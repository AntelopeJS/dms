/**
 * The "add new entry" item of a relation picker is no pick: it opens the add
 * form, and the field keeps its value. Forwarded to the form with the other
 * events, the item became the field's value and was refused as required; and
 * opened while the menu still held the focus, the drawer closed at once.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL(
    "../layers/dms-ui/app/components/form/components/Relation.vue",
    import.meta.url,
  ),
  "utf8",
);

describe("a relation picker's add entry", () => {
  it("never forwards a pick past its own handler", () => {
    expect(source).toMatch(
      /const \{ "onUpdate:modelValue": _, \.\.\.rest \} = forwardedPropsEmits\.value/,
    );
    expect(source).toContain('@update:model-value="handleUpdateModelValue"');
  });

  it("opens the add form once the menu has closed", () => {
    const handler = /function handleUpdateModelValue[\s\S]*?\n\}/.exec(
      source,
    )?.[0];
    expect(handler).toContain("void openAddDrawerOnceClosed();");
    expect(handler).not.toContain(
      'emits("update:modelValue", props.modelValue',
    );
    expect(source).toContain(':open="isMenuOpen"');
  });
});
