import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  Mandatory,
  ModelReference,
  Optional,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { Model } from "@antelopejs/interface-database-decorators";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  Column,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import {
  InlineProduct,
  type InlineProductCategory,
  InlineProductModel,
} from "./database";

const CATEGORIES: { value: InlineProductCategory; label: string }[] = [
  { value: "furniture", label: "Furniture" },
  { value: "lighting", label: "Lighting" },
  { value: "office", label: "Office" },
  { value: "storage", label: "Storage" },
  { value: "textile", label: "Textile" },
];

/**
 * The products of the "Inline edit" demo: a column per kind of simple value
 * the grid edits in place, a read-only one, and notes in rich text, which
 * stay in the edit form.
 */
@RegisterDataController()
export class inlineProductDataAPI extends DataController(
  InlineProduct,
  TableViewRoutes.All,
  Controller("/api/playground/inline-products"),
) {
  @ModelReference()
  @Model(InlineProductModel)
  declare model: InlineProductModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Listable()
  @Sortable()
  @Column({
    name: "Name",
    type: new DefaultDataTypes.StringType({ placeholder: "Product name" }),
    size: 240,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Searchable()
  @Listable()
  @Column({
    name: "SKU",
    type: new DefaultDataTypes.StringType(),
    description: "Given by the warehouse, never edited here",
    size: 120,
  })
  @Access(AccessMode.ReadOnly)
  declare sku: string;

  @Listable()
  @Sortable()
  @Column({
    name: "Price",
    type: new DefaultDataTypes.PriceType({ min: 0 }),
    size: 130,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare price: number;

  @Listable()
  @Sortable()
  @Column({
    name: "Stock",
    type: new DefaultDataTypes.NumberType({ min: 0, step: 1 }),
    description: "Locked while the product is inactive",
    disabledWhen: { field: "active", in: [false] },
    size: 110,
  })
  @Access(AccessMode.ReadWrite)
  declare stock: number;

  @Listable()
  @Column({
    name: "Active",
    type: new DefaultDataTypes.BooleanType(),
    defaultValue: true,
    filterable: true,
    size: 100,
  })
  @Access(AccessMode.ReadWrite)
  declare active: boolean;

  @Listable()
  @Sortable()
  @Column({
    name: "Category",
    type: new DefaultDataTypes.SelectType({ items: CATEGORIES }),
    filterable: true,
    size: 150,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare category: InlineProductCategory;

  @Listable()
  @Sortable()
  @Column({
    name: "Launch date",
    type: new DefaultDataTypes.DateType(),
    size: 170,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare launchDate: Date | null;

  @Listable()
  @Column({
    name: "Notes",
    type: new DefaultDataTypes.RichTextType({
      placeholder: "Notes for the sales team",
    }),
    size: 260,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare notes: string | null;
}
