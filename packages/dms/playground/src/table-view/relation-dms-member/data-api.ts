import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  ModelReference,
  Optional,
} from "@antelopejs/interface-data-api/metadata";
import { memberSettingDataAPI } from "@antelopejs/interface-dms/data-controllers";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  Column,
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { relMemberDataAPI } from "../relation-key/data-api";
import { RelDmsAssign, RelDmsAssignModel } from "./database";

@RegisterDataController()
export class relDmsAssignDataAPI extends DataController(
  RelDmsAssign,
  TableViewRoutes.All,
  Controller("/api/rel-dms-assign"),
) {
  @ModelReference()
  @TenantScopedModel(RelDmsAssignModel)
  declare model: RelDmsAssignModel;

  @Select()
  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Select()
  @Listable()
  @Column({
    name: "Label",
    type: new DefaultDataTypes.StringType({ placeholder: "Assignment label" }),
    filterable: true,
  })
  @Access(AccessMode.ReadWrite)
  declare label: string;

  @Listable()
  @Select()
  @Column({
    name: "DMS Member",
    type: new DefaultDataTypes.RelationType({
      dataApiController: memberSettingDataAPI,
      keyMapping: { label: "name", value: "_id" },
    }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare member: string;

  @Listable()
  @Select()
  @Column({
    name: "Synthetic Member",
    type: new DefaultDataTypes.RelationType({
      dataApiController: relMemberDataAPI,
      keyMapping: { label: "name", value: "_id" },
    }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare synthMember: string;
}
