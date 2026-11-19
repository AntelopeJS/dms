import { Controller } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  ModelReference,
} from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Column,
  ColumnGroup,
  TableViewMeta,
} from "@antelopejs/interface-dms/base/table-view/meta";
import { TableViewRoutes } from "@antelopejs/interface-dms/base/table-view/routes";
import { expect } from "chai";
import { z } from "zod";
import {
  type CompiledSpec,
  compileSpec,
  type Json,
  type JsonObject,
  mockupNameSchema,
  parseSpec,
} from "../../../mockup";

const DEMO = mockupNameSchema.parse("demo");

const CUSTOMERS = [
  { _id: "c1", name: "Acme", email: "hi@acme.test", phone: "01", notes: "" },
];

function compile(tree: Json[]): CompiledSpec {
  const read = parseSpec(
    JSON.stringify({
      version: 1,
      pages: [
        {
          id: "customers",
          title: "Customers",
          fixtures: { customers: CUSTOMERS, customer: CUSTOMERS[0] },
          tree,
        },
      ],
    }),
  );
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

/** A field or a group as the serialized form carries it: its id, its label, whether it is disabled, and a group's fields. */
interface Entry {
  id: string;
  label?: string;
  description?: string;
  orientation?: string;
  disabled?: boolean;
  fields?: Entry[];
}

const entrySchema: z.ZodType<Entry> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string().optional(),
    description: z.string().optional(),
    orientation: z.string().optional(),
    disabled: z.boolean().optional(),
    fields: z.array(entrySchema).optional(),
  }),
);

const formSchema = z.object({
  fields: z.array(entrySchema),
  sections: z
    .array(z.object({ id: z.string(), fieldIds: z.array(z.string()) }))
    .optional(),
});

/** Each entry as `id`, a group as `id[...its fields]`, a disabled one marked `!`. */
function layoutOf(entries: Entry[]): string[] {
  return entries.map((entry) => {
    const id = `${entry.id}${entry.disabled ? "!" : ""}`;
    return entry.fields ? `${id}[${layoutOf(entry.fields).join(",")}]` : id;
  });
}

const SECTIONS: Json[] = [
  {
    id: "general",
    label: "General",
    fields: [
      { id: "name", label: "Name", type: "string" },
      {
        id: "contact",
        label: "Contact",
        fields: [
          { id: "email", label: "Email", type: "string" },
          { id: "phone", label: "Phone", type: "string" },
        ],
      },
    ],
  },
  {
    id: "more",
    label: "More",
    fields: [{ id: "notes", label: "Notes", type: "string" }],
  },
];

describe("[unit] a mockup ResourceForm with sections and groups", () => {
  it("draws every field of every section and group disabled in view mode, the sections kept (fails when view mode leaves a section's fields open)", () => {
    const compiled = compile([
      {
        type: "ResourceForm",
        options: {
          mode: "view",
          fetchUrl: "fixture:customer",
          sectionNav: "jump",
          sections: SECTIONS,
        },
      },
    ]);
    const form = formSchema
      .passthrough()
      .parse(compiled.pages[0].tree[0].options);

    expect(compiled.issues).to.deep.equal([]);
    expect(layoutOf(form.fields)).to.deep.equal([
      "name!",
      "contact[email!,phone!]",
      "notes!",
    ]);
    expect(form.sections?.map((section) => section.id)).to.deep.equal([
      "general",
      "more",
    ]);
    expect(form).to.have.property("sectionNav", "jump");
  });
});

function customersTable(options: JsonObject): JsonObject {
  return {
    type: "TableView",
    options: {
      caption: "Customers",
      fetchUrl: "fixture:customers",
      columns: {
        name: { name: "Name", type: "string", order: 1 },
        email: { name: "Email", type: "string", order: 2, group: "contact" },
        notes: { name: "Notes", type: "string", order: 3 },
        phone: { name: "Phone", type: "string", order: 4, group: "contact" },
      },
      rowActions: { add: true, edit: true, details: true },
      ...options,
    },
  };
}

const formsSchema = z.object({
  formComponents: z.record(z.object({ options: formSchema })),
});

const CONTACT = {
  label: "Contact",
  description: "How to reach them",
  orientation: "horizontal",
} as const;

const TABLE = "mockup-form-groups";

@RegisterTable(TABLE, "mockup-form-groups-test")
class Customer extends Table {
  @Field("string") declare name: string;
  @Field("string") declare email: string;
  @Field("string") declare notes: string;
  @Field("string") declare phone: string;
}

class CustomerModel extends BasicDataModel(Customer, TABLE) {}

const text = () => new DefaultDataTypes.StringType();

@ColumnGroup("contact", CONTACT)
@RegisterDataController()
class CustomerAPI extends DataController(
  Customer,
  TableViewRoutes.All,
  Controller("/mockup-form-groups-test"),
) {
  @ModelReference()
  @Model(CustomerModel)
  declare model: CustomerModel;

  @Column({ name: "Name", type: text(), order: 1 })
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Column({ name: "Email", type: text(), order: 2, group: "contact" })
  @Access(AccessMode.ReadWrite)
  declare email: string;

  @Column({ name: "Notes", type: text(), order: 3 })
  @Access(AccessMode.ReadWrite)
  declare notes: string;

  @Column({ name: "Phone", type: text(), order: 4, group: "contact" })
  @Access(AccessMode.ReadWrite)
  declare phone: string;
}

/** The layout of the real `TableView`'s form over the same columns, in `mode`. */
function realLayout(mode: "new" | "view"): string[] {
  const fields = GetMetadata(CustomerAPI, TableViewMeta).getFormFields(mode);
  return layoutOf(z.array(entrySchema).parse(fields));
}

describe("[unit] a mockup table's generated forms with column groups", () => {
  it("groups the fields of the add, edit and details forms as @Column({ group }) and @ColumnGroup do, at the first column of each group (fails when the group is dropped)", () => {
    const compiled = compile([
      customersTable({ columnGroups: { contact: CONTACT } }),
    ]);
    const { formComponents } = formsSchema.parse(
      compiled.pages[0].tree[0].options,
    );

    expect(compiled.issues).to.deep.equal([]);
    expect(layoutOf(formComponents.new.options.fields))
      .to.deep.equal(realLayout("new"))
      .and.to.deep.equal(["name", "contact[email,phone]", "notes"]);
    expect(layoutOf(formComponents.view.options.fields))
      .to.deep.equal(realLayout("view"))
      .and.to.deep.equal(["name!", "contact[email!,phone!]", "notes!"]);
    expect(formComponents.edit.options.fields[1]).to.deep.include({
      id: "contact",
      ...CONTACT,
    });
  });

  it("labels a group no columnGroups declares by its id, as the real TableView does", () => {
    const { formComponents } = formsSchema.parse(
      compile([customersTable({})]).pages[0].tree[0].options,
    );

    expect(formComponents.new.options.fields[1]).to.deep.include({
      id: "contact",
      label: "contact",
    });
  });
});
