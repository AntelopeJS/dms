import { describe, expect, it } from "vitest";
import {
  errorFieldId,
  invalidFieldIds,
  layoutSections,
  resolveSectionNav,
  sectionState,
} from "../layers/dms-ui/app/build/composables/form/formSections";
import type { FormFieldOrGroup } from "../layers/dms-ui/app/composables/form/types/field";

const field = (id: string, label?: string) => ({
  id,
  label,
  component: { componentName: "dms-input-text" },
});

const ENTRIES: FormFieldOrGroup[] = [
  field("intro"),
  field("name", "Name"),
  { id: "contact", label: "Contact", fields: [field("email"), field("phone")] },
  field("notes", "Notes"),
];

const SECTIONS = [
  { id: "general", label: "General", fieldIds: ["name", "contact"] },
  { id: "advanced", label: "Advanced", fieldIds: ["notes"] },
];

describe("form sections", () => {
  it("lists the sections beside them from three sections, none below", () => {
    expect(resolveSectionNav(undefined, 2)).toBe("none");
    expect(resolveSectionNav(undefined, 3)).toBe("side");
    expect(resolveSectionNav("jump", 5)).toBe("jump");
    expect(resolveSectionNav("side", 1)).toBe("side");
  });

  it("puts each entry in its section, the others first", () => {
    const layout = layoutSections(ENTRIES, SECTIONS);
    expect(layout.lead.map((entry) => entry.id)).toEqual(["intro"]);
    expect(
      layout.sections.map((section) => [
        section.id,
        section.entries.map((entry) => entry.id),
        section.fieldIds,
      ]),
    ).toEqual([
      ["general", ["name", "contact"], ["name", "email", "phone"]],
      ["advanced", ["notes"], ["notes"]],
    ]);
  });

  it("skips a section entry the form does not hold", () => {
    const layout = layoutSections(ENTRIES, [
      { id: "s", label: "S", fieldIds: ["gone", "notes"] },
    ]);
    expect(layout.sections[0]?.entries.map((entry) => entry.id)).toEqual([
      "notes",
    ]);
  });

  it("gives an error to the field it names, or whose part it names", () => {
    const ids = ["address", "title", "title2"];
    expect(errorFieldId("address", ids)).toBe("address");
    expect(errorFieldId("address.streetName", ids)).toBe("address");
    expect(errorFieldId("title2.en", ids)).toBe("title2");
    expect(errorFieldId("other", ids)).toBeUndefined();
    expect(errorFieldId(undefined, ids)).toBeUndefined();
  });

  it("lists the invalid fields once each, in the form's order", () => {
    const errors = [
      { name: "notes" },
      { name: "email.domain" },
      { name: "notes" },
      { name: "unknown" },
      { name: "email" },
    ];
    expect(invalidFieldIds(errors, ["name", "email", "notes"])).toEqual([
      "email",
      "notes",
    ]);
  });

  it("marks a section changed or invalid from its fields", () => {
    const [general] = layoutSections(ENTRIES, SECTIONS).sections;
    expect(sectionState(general!, new Set(["phone"]), new Set())).toEqual({
      dirty: true,
      invalidCount: 0,
    });
    expect(
      sectionState(general!, new Set(), new Set(["name", "email", "notes"])),
    ).toEqual({ dirty: false, invalidCount: 2 });
  });
});
