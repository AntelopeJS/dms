import { expect } from "chai";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { z } from "zod";
import {
  compileSpec,
  type Json,
  type JsonObject,
  mockupNameSchema,
  parseSpec,
} from "../../../mockup";

const DEMO = mockupNameSchema.parse("demo");

const RECORD = { name: "Ada", email: "ada@example.com", notes: "" };

const SECTIONS: Json[] = [
  {
    id: "general",
    label: "General",
    icon: "i-ph-gear",
    fields: [
      { id: "name", label: "Name", type: "string" },
      {
        id: "contact",
        label: "Contact",
        fields: [{ id: "email", label: "Email", type: "string" }],
      },
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    fields: [{ id: "notes", label: "Notes", type: "string" }],
  },
];

const OWN_FIELDS: Json[] = [{ id: "intro", label: "Intro", type: "string" }];

const layoutSchema = z
  .object({
    fields: z.array(z.object({ id: z.string() })),
    sections: z.array(z.record(z.unknown())),
  })
  .transform(({ fields, sections }) => ({
    fieldIds: fields.map((field) => field.id),
    sections,
  }));

function compiledOptions(node: Json): JsonObject {
  const read = parseSpec(
    JSON.stringify({
      version: 1,
      pages: [
        {
          id: "home",
          title: "Home",
          fixtures: { record: RECORD },
          tree: [node],
        },
      ],
    }),
  );
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  const { issues, pages } = compileSpec(DEMO, read.spec);
  expect(issues).to.deep.equal([]);
  return pages[0].tree[0].options ?? {};
}

function factoryLayout() {
  const text = () => new DefaultDataTypes.StringType();
  const form = Form({
    fields: [{ id: "intro", label: "Intro", type: text() }],
    sections: [
      {
        id: "general",
        label: "General",
        icon: "i-ph-gear",
        fields: [
          { id: "name", label: "Name", type: text() },
          {
            id: "contact",
            label: "Contact",
            fields: [{ id: "email", label: "Email", type: text() }],
          },
        ],
      },
      {
        id: "advanced",
        label: "Advanced",
        fields: [{ id: "notes", label: "Notes", type: text() }],
      },
    ],
  });
  return layoutSchema.parse(form.serializeSync().options);
}

describe("[unit] a mockup form written with sections that hold their fields", () => {
  it("reaches the component in the layout the Form factory serializes (fails when the sections reach it with fields and no fieldIds)", () => {
    const options = compiledOptions({
      type: "Form",
      options: { fields: OWN_FIELDS, sections: SECTIONS },
    });

    expect(layoutSchema.parse(options)).to.deep.equal(factoryLayout());
  });

  it("reaches the component of a ResourceForm in the same layout (fails when only the Form block is serialized)", () => {
    const options = compiledOptions({
      type: "ResourceForm",
      options: {
        mode: "edit",
        fetchUrl: "fixture:record",
        fields: OWN_FIELDS,
        sections: SECTIONS,
      },
    });

    expect(layoutSchema.parse(options)).to.deep.equal(factoryLayout());
  });

  it("keeps a section that names its fields by id as written (fails when the serialized layout is rewritten)", () => {
    const sections = [{ id: "all", label: "All", fieldIds: ["intro"] }];
    const options = compiledOptions({
      type: "Form",
      options: { fields: OWN_FIELDS, sections },
    });

    expect(layoutSchema.parse(options)).to.deep.equal({
      fieldIds: ["intro"],
      sections,
    });
  });

  it("reports a bad field inside a section at its pointer in the spec (fails when validation reads the serialized layout)", () => {
    const read = parseSpec(
      JSON.stringify({
        version: 1,
        pages: [
          {
            id: "home",
            title: "Home",
            tree: [
              {
                type: "Form",
                options: {
                  sections: [
                    {
                      id: "a",
                      label: "A",
                      fields: [{ id: 3, type: "string" }],
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    );
    if (!read.ok) throw new Error(JSON.stringify(read.issues));

    const paths = compileSpec(DEMO, read.spec).issues.map(
      (issue) => issue.path,
    );

    expect(paths).to.have.length.greaterThan(0);
    expect(
      paths.every((path) =>
        path.startsWith("/pages/0/tree/0/options/sections/0/fields/0"),
      ),
      paths.join(", "),
    ).to.equal(true);
  });

  it("reports a section that both holds fields and names them by id, at its fieldIds (fails when the written ids are dropped in silence)", () => {
    const read = parseSpec(
      JSON.stringify({
        version: 1,
        pages: [
          {
            id: "home",
            title: "Home",
            tree: [
              {
                type: "Form",
                options: {
                  fields: OWN_FIELDS,
                  sections: [
                    {
                      id: "s",
                      label: "S",
                      fields: [{ id: "b", label: "B", type: "string" }],
                      fieldIds: ["intro"],
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    );
    if (!read.ok) throw new Error(JSON.stringify(read.issues));

    const { issues } = compileSpec(DEMO, read.spec);

    expect(issues.map((issue) => issue.path)).to.deep.equal([
      "/pages/0/tree/0/options/sections/0/fieldIds",
    ]);
  });
});
