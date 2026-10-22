/**
 * The "add new entry" of a relation picker is no item: picked, it became the
 * field's value (the select keeps an uncontrolled pick while the field is
 * empty) and was refused as required. It is a button under the list, and the
 * add form opens only once the menu has left the page: opened while the menu
 * was closing, the drawer lost the focus the menu handed back to the field and
 * closed at once.
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

  it("is a button under the list, never an item to pick", () => {
    const items = /const mergedItems = computed[\s\S]*?\n\}\);/.exec(
      source,
    )?.[0];
    expect(items).not.toContain("add_new");
    expect(source).toMatch(/#content-bottom>[\s\S]*?ref="addEntry"/);
    expect(source).toContain('@click="openAddDrawerOnceClosed"');
  });

  it("opens the add form once the menu has left the page", () => {
    const opener = /async function openAddDrawerOnceClosed[\s\S]*?\n\}/.exec(
      source,
    )?.[0];
    expect(opener).toContain("isMenuOpen.value = false;");
    expect(opener).toContain("await waitForDetached(menuContent);");
    expect(opener).toContain("MENU_FOCUS_SETTLE_MS");
    expect(source).toContain(':open="isMenuOpen"');
  });
});
