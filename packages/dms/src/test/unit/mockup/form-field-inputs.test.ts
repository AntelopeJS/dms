import { expect } from "chai";
import { CreateDataType } from "@antelopejs/interface-dms/base/data-types";
import { Form } from "@antelopejs/interface-dms/base/form-schema";
import { z } from "zod";
import {
  type CompiledSpec,
  compileSpec,
  type Json,
  type JsonObject,
  jsonObjectSchema,
  mockupNameSchema,
  parseSpec,
} from "../../../mockup";

const DEMO = mockupNameSchema.parse("demo");

function compile(tree: Json[], fixtures: Json = {}): CompiledSpec {
  const spec = {
    version: 1,
    pages: [{ id: "home", title: "Home", fixtures, tree }],
  };
  const read = parseSpec(JSON.stringify(spec));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

const fieldsSchema = z.object({ fields: z.array(jsonObjectSchema) });

function compiledFields(compiled: CompiledSpec): JsonObject[] {
  return fieldsSchema.parse(compiled.pages[0].tree[0].options).fields;
}

/** The `component` the real `Form` factory serializes for a field of `type`. */
function factoryComponent(type: string): Json | undefined {
  const built = Form({
    fields: [{ id: "probe", type: CreateDataType(type) }],
  }).serializeSync();
  const serialized = fieldsSchema.parse(
    JSON.parse(JSON.stringify(built.options)),
  );
  return serialized.fields[0]?.component;
}

describe("a mockup form field written with a type and no component", () => {
  it("reaches the preview with its data type's input, as the Form factory serializes it (fails when the field reaches the form component with no component)", () => {
    const compiled = compile([
      {
        type: "Form",
        options: {
          fields: [
            { id: "name", type: "string" },
            { id: "email", type: "email" },
          ],
        },
      },
    ]);

    expect(compiled.issues).to.deep.equal([]);
    expect(
      compiledFields(compiled).map((field) => field.component),
    ).to.deep.equal([factoryComponent("string"), factoryComponent("email")]);
  });

  it("gives the fields of a group and of a section their input too, and reports a section field at its pointer in the section (fails when only top-level fields are filled)", () => {
    const compiled = compile([
      {
        type: "Form",
        options: {
          fields: [
            {
              id: "who",
              label: "Who",
              fields: [{ id: "age", type: "number" }],
            },
          ],
          sections: [
            {
              id: "contact",
              label: "Contact",
              fields: [
                { id: "phone", type: "phone" },
                { id: "fax", type: "bogus" },
              ],
            },
          ],
        },
      },
    ]);
    const options = z
      .object({
        fields: z.tuple([
          z.object({ fields: z.tuple([jsonObjectSchema]) }),
          jsonObjectSchema,
        ]),
        sections: z.tuple([z.object({ fieldIds: z.array(z.string()) })]),
      })
      .parse(compiled.pages[0].tree[0].options);

    expect(options.fields[0].fields[0].component).to.deep.equal(
      factoryComponent("number"),
    );
    expect(options.fields[1]).to.deep.include({
      id: "phone",
      component: factoryComponent("phone"),
    });
    expect(options.sections[0].fieldIds).to.deep.equal(["phone"]);
    expect(compiled.issues.map((issue) => issue.path)).to.deep.equal([
      "/pages/0/tree/0/options/sections/0/fields/1/type",
    ]);
  });

  it("gives a ResourceForm's fields their input (fails when only the Form block is filled)", () => {
    const compiled = compile(
      [
        {
          type: "ResourceForm",
          options: {
            fetchUrl: "fixture:book",
            fields: [{ id: "title", type: "string" }],
          },
        },
      ],
      { book: { title: "Dune" } },
    );

    expect(compiledFields(compiled)[0].component).to.deep.equal(
      factoryComponent("string"),
    );
  });
});

describe("a mockup form field that writes its input or cannot get one", () => {
  it("keeps a component or an inputComponent the spec writes, and falls back to the type's on null as the factory does (fails when a written input is replaced, or a null one reaches the form component)", () => {
    const written = { componentName: "dms-input-textarea", options: {} };
    const compiled = compile([
      {
        type: "Form",
        options: {
          fields: [
            { id: "a", type: "string", component: written },
            { id: "b", type: "string", inputComponent: written },
            { id: "c", type: "string", component: null },
            { id: "d", type: "string", inputComponent: null },
          ],
        },
      },
    ]);

    expect(
      compiledFields(compiled).map((field) => field.component),
    ).to.deep.equal([
      written,
      written,
      factoryComponent("string"),
      factoryComponent("string"),
    ]);
  });

  it("reports a field it cannot give an input at its pointer, and leaves it out of the preview (fails when the form component gets a field with no component)", () => {
    const compiled = compile([
      {
        type: "Form",
        options: {
          fields: [
            { id: "x", type: "bogus" },
            { id: "y" },
            { id: "z", type: "string" },
          ],
        },
      },
    ]);

    expect(compiled.issues).to.deep.equal([
      { path: "/pages/0/tree/0/options/fields/1", message: "Invalid input" },
      {
        path: "/pages/0/tree/0/options/fields/0/type",
        message:
          'the data type "bogus" gives no input: it is not registered, or it needs options a mockup cannot give, so write the field\'s component',
      },
    ]);
    expect(compiledFields(compiled).map((field) => field.id)).to.deep.equal([
      "z",
    ]);
  });
});
