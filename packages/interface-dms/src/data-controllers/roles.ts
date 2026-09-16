import { Controller } from "@antelopejs/interface-api";
import { DataController } from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  Mandatory,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { Role, RoleModel } from "../db";
import { TenantScopedModel } from "../tenant-scoped-model";
import { DefaultDataTypes } from "../base/data-types/default-types";
import { Searchable } from "../base/searchable";
import { Column, Exported, Select, TableViewRoutes } from "../base/table-view";
import { ReadonlyBehaviorType } from "../base/types";

export class roleSettingDataAPI extends DataController(
  Role,
  TableViewRoutes.All,
  Controller("/api/tables/roles"),
) {
  @ModelReference()
  @TenantScopedModel(RoleModel)
  declare model: RoleModel;

  @Select()
  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Select()
  @Listable()
  @Searchable()
  @Exported()
  @Column({
    name: "$page.settings.roles.column.name",
    type: new DefaultDataTypes.StringType({
      placeholder: "$page.settings.roles.placeholder.name",
    }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Sortable()
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Listable()
  @Column({
    name: "$page.settings.roles.column.permissions",
    type: new DefaultDataTypes.PermissionsType({
      fetchUrl: "/settings/user/roles/permissions-tree",
    }),
    description: "$page.settings.roles.description.permissions",
    defaultValue: [],
  })
  @Access(AccessMode.ReadWrite)
  declare permissions: string[];

  @Exported()
  @Column({
    name: "$page.settings.roles.column.created_at",
    type: new DefaultDataTypes.DateType(),
    description: "$page.settings.roles.description.created_at",
    readonlyBehavior: {
      edit: ReadonlyBehaviorType.disabled,
      view: ReadonlyBehaviorType.disabled,
      new: ReadonlyBehaviorType.hidden,
    },
  })
  @Access(AccessMode.ReadOnly)
  declare createdAt: Date;

  @Exported()
  @Column({
    name: "$page.settings.roles.column.updated_at",
    type: new DefaultDataTypes.DateType(),
    description: "$page.settings.roles.description.updated_at",
    readonlyBehavior: {
      edit: ReadonlyBehaviorType.disabled,
      view: ReadonlyBehaviorType.disabled,
      new: ReadonlyBehaviorType.hidden,
    },
  })
  @Access(AccessMode.ReadOnly)
  declare updatedAt: Date;
}
