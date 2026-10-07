import { expect } from "chai";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Form,
  FormComponents,
  type FormPropsSerialized,
  formSchema,
} from "@antelopejs/interface-dms/base/form";
import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-types";

const text = () => new DefaultDataTypes.StringType();

const sectionedForm = () =>
  Form({
    fields: [{ id: "intro", type: text() }],
    sections: [
      {
        id: "general",
        label: "General",
        icon: "i-ph-gear",
        fields: [
          { id: "name", type: text(), required: true },
          {
            id: "contact",
            label: "Contact",
            fields: [{ id: "email", type: new DefaultDataTypes.EmailType() }],
          },
        ],
      },
      {
        id: "advanced",
        label: "Advanced",
        fields: [{ id: "notes", type: text() }],
      },
    ],
    sectionNav: "jump",
  });

const optionsOf = (form: ReturnType<typeof Form>) =>
  form.serializeSync().options as FormPropsSerialized;

/**
 * A form's sections are titled cards of one form: their fields are the form's
 * fields, validated and submitted together.
 */
describe("[unit] interfaces/dms-base — form sections", () => {
  it("lists every entry in fields: its own first, then each section's", () => {
    const ids = optionsOf(sectionedForm()).fields.map((item) => item.id);
    expect(ids).to.deep.equal(["intro", "name", "contact", "notes"]);
  });

  it("sends each section with the ids of the entries it holds", () => {
    expect(optionsOf(sectionedForm()).sections).to.deep.equal([
      {
        id: "general",
        label: "General",
        icon: "i-ph-gear",
        fieldIds: ["name", "contact"],
      },
      { id: "advanced", label: "Advanced", fieldIds: ["notes"] },
    ]);
    expect(optionsOf(sectionedForm()).sectionNav).to.equal("jump");
  });

  it("validates the fields of every section", () => {
    const schema = formSchema(sectionedForm());
    expect(Object.keys(schema.shape)).to.deep.equal([
      "intro",
      "name",
      "email",
      "notes",
    ]);
    expect(schema.safeParse({ name: "" }).success).to.equal(false);
  });

  it("reads a section-only declaration as a schema source", () => {
    const schema = formSchema({
      sections: [{ id: "a", label: "A", fields: [{ id: "x", type: text() }] }],
    });
    expect(Object.keys(schema.shape)).to.deep.equal(["x"]);
  });

  it("sends no sections for a form without any", () => {
    expect(optionsOf(Form({ fields: [] }))).to.not.have.any.keys("sections");
  });

  it("offers sections and their navigation in the catalog", () => {
    const config = ListBlockTypes().find(
      (block) => block.type === "Form",
    )?.config;
    expect(config?.sections?.items?.ui?.label).to.equal("Section");
    expect(config?.sectionNav?.enum).to.deep.equal(["side", "jump", "none"]);
  });
});

/** A required box to tick is an agreement: only `true` satisfies it. */
describe("[unit] interfaces/dms-base — required box to tick", () => {
  const terms = (
    inputComponent?: ReturnType<typeof FormComponents.InputCheckbox>,
  ) =>
    formSchema([
      {
        id: "terms",
        type: new DefaultDataTypes.BooleanType(),
        inputComponent,
        required: true,
      },
    ]);

  it("refuses an unticked checkbox", () => {
    const schema = terms(FormComponents.InputCheckbox());
    expect(schema.safeParse({ terms: false }).success).to.equal(false);
    expect(schema.safeParse({ terms: true }).success).to.equal(true);
  });

  it("keeps a switch's false a value", () => {
    expect(terms().safeParse({ terms: false }).success).to.equal(true);
  });
});
