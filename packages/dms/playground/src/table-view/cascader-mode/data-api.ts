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
} from "@antelopejs/interface-data-api/metadata";
import { Model } from "@antelopejs/interface-database-decorators";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  Column,
  Exported,
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { ReadonlyBehaviorType } from "@antelopejs/interface-dms/base/types";
import {
  CascaderCategory,
  CascaderCategoryModel,
  CascaderProduct,
  CascaderProductModel,
} from "./database";

@RegisterDataController()
export class cascaderCategoryDataAPI extends DataController(
  CascaderCategory,
  TableViewRoutes.All,
  Controller("/api/cascader-category"),
) {
  @ModelReference()
  @Model(CascaderCategoryModel)
  declare model: CascaderCategoryModel;

  @Select()
  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Select()
  @Listable()
  @Exported()
  @Column({
    name: "Name",
    type: new DefaultDataTypes.StringType({
      placeholder: "Enter category name",
    }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Select()
  @Listable()
  @Column({
    name: "Parent id",
    type: new DefaultDataTypes.StringType({
      placeholder: "Parent category id (leave empty for a root category)",
    }),
    description: "Self-reference: the _id of the parent category",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare parent: string;

  @Select()
  @Listable()
  @Column({
    name: "Inactive",
    type: new DefaultDataTypes.BooleanType(),
    filterable: true,
    defaultValue: false,
    description: "Inactive categories are greyed out in the cascader",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare isInactive: boolean;
}

@RegisterDataController()
export class cascaderProductDataAPI extends DataController(
  CascaderProduct,
  TableViewRoutes.All,
  Controller("/api/cascader-product"),
) {
  @ModelReference()
  @Model(CascaderProductModel)
  declare model: CascaderProductModel;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Listable()
  @Exported()
  @Column({
    name: "Name",
    type: new DefaultDataTypes.StringType({
      placeholder: "Enter product name",
    }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Listable()
  @Column({
    name: "Category",
    type: new DefaultDataTypes.CascaderRelationType({
      placeholder: "Select a category",
      dataApiController: cascaderCategoryDataAPI,
      keyMapping: {
        label: "name",
        value: "_id",
        parent: "parent",
        disabled: "isInactive",
      },
    }),
    description: "Single hierarchical category (any level can be selected)",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare category: string;

  @Listable()
  @Column({
    name: "Leaf categories",
    type: new DefaultDataTypes.CascaderRelationType({
      placeholder: "Select one or more leaf categories",
      dataApiController: cascaderCategoryDataAPI,
      multiple: true,
      leafOnly: true,
      keyMapping: {
        label: "name",
        value: "_id",
        parent: "parent",
        disabled: "isInactive",
      },
    }),
    description: "Multiple selection restricted to leaf nodes",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare categories: string[];

  @Exported()
  @Column({
    name: "Created At",
    type: new DefaultDataTypes.DateType(),
    readonlyBehavior: ReadonlyBehaviorType.hidden,
  })
  @Access(AccessMode.ReadOnly)
  declare createdAt: Date;

  @Exported()
  @Column({
    name: "Updated At",
    type: new DefaultDataTypes.DateType(),
    readonlyBehavior: ReadonlyBehaviorType.hidden,
  })
  @Access(AccessMode.ReadOnly)
  declare updatedAt: Date;
}
