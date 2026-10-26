/**
 * The label/value layout of a form follows its container: FieldRow's form
 * rows set the label beside the value from 560px of the row's own width.
 * Fields whose value is a block of its own (a repeater, pairs, code, rich
 * text, a gallery, a long text) never sit beside a label: in a 690px drawer
 * the value column would leave a repeater too narrow for its table and drop
 * it into its stacked cards. They take the full width under their label,
 * read-only as editable.
 */
import { describe, expect, it } from "vitest";
import {
  CONTAINER_LAYOUT_CLASSES,
  FORM_LAYOUT_CLASSES,
  SECTION_LAYOUT_CLASSES,
  entryFields,
  entryRowLayout,
  isWideField,
} from "../layers/dms-ui/app/entries/composables/form/formLayout";
import type {
  FieldGroup,
  FormField,
} from "../layers/dms-ui/app/composables/form/types/field";

function field(
  componentName: string,
  options?: FormField["component"]["options"],
  type?: string,
): FormField {
  return { id: componentName, type, component: { componentName, options } };
}

const HORIZONTAL_ROW = FORM_LAYOUT_CLASSES.horizontal.row;

describe("isWideField", () => {
  it.each(["dms-repeater", "dms-key-value", "dms-input-code", "dms-rich-text"])(
    "takes the full width for %s",
    (name) => {
      expect(isWideField(field(name))).toBe(true);
    },
  );

  it.each(["array", "key_value", "code", "rich_text"])(
    "takes the full width for a read-only %s value",
    (type) => {
      expect(isWideField(field("", undefined, type))).toBe(true);
    },
  );

  it("takes the full width for several files or images, not one", () => {
    expect(isWideField(field("dms-image", { multiple: true }))).toBe(true);
    expect(isWideField(field("dms-file", { multiple: true }))).toBe(true);
    expect(isWideField(field("dms-image"))).toBe(false);
    expect(isWideField(field("dms-file", { multiple: false }))).toBe(false);
  });

  it("takes the full width for a textarea taller than three rows", () => {
    expect(isWideField(field("dms-textarea", { rows: 6 }))).toBe(true);
    expect(isWideField(field("dms-textarea", { rows: 3 }))).toBe(false);
    expect(isWideField(field("dms-textarea"))).toBe(false);
  });

  it.each(["dms-input-text", "dms-select", "dms-relation", "dms-date-picker"])(
    "keeps %s beside its label",
    (name) => {
      expect(isWideField(field(name, undefined, "string"))).toBe(false);
    },
  );
});

describe("entryRowLayout", () => {
  it("stacks the label above a wide field in a two-column form", () => {
    expect(entryRowLayout(HORIZONTAL_ROW, [field("dms-repeater")])).toEqual({
      ...HORIZONTAL_ROW,
      layout: "stack",
    });
    expect(
      entryRowLayout(SECTION_LAYOUT_CLASSES.row, [field("dms-key-value")]),
    ).toEqual({ ...SECTION_LAYOUT_CLASSES.row, layout: "stack" });
  });

  it("stacks a wide field in a drawer's dense rows too", () => {
    const row = CONTAINER_LAYOUT_CLASSES.horizontal.row;
    expect(entryRowLayout(row, [field("dms-repeater")])).toEqual({
      ...row,
      layout: "stack",
    });
  });

  it("keeps a narrow field in the form's columns", () => {
    expect(entryRowLayout(HORIZONTAL_ROW, [field("dms-input-text")])).toBe(
      HORIZONTAL_ROW,
    );
  });

  it("stacks a group holding a wide field", () => {
    const group: FieldGroup = {
      id: "group",
      fields: [field("dms-input-text"), field("dms-input-code")],
    };
    expect(entryRowLayout(HORIZONTAL_ROW, entryFields(group)).layout).toBe(
      "stack",
    );
  });

  it("leaves a vertical form's rows as they are", () => {
    const row = FORM_LAYOUT_CLASSES.vertical.row;
    expect(entryRowLayout(row, [field("dms-repeater")])).toBe(row);
  });
});
