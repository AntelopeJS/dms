import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Joined,
  Listable,
  ModelReference,
  Optional,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { Model } from "@antelopejs/interface-database-decorators";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  Column,
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import {
  RelAssign,
  RelAssignModel,
  RelDept,
  RelDeptModel,
  RelMember,
  RelMemberModel,
  RelUser,
} from "./database";

@RegisterDataController()
export class relDeptDataAPI extends DataController(
  RelDept,
  TableViewRoutes.All,
  Controller("/api/rel-dept"),
) {
  @ModelReference()
  @Model(RelDeptModel)
  declare model: RelDeptModel;

  @Select()
  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Select()
  @Listable()
  @Column({ name: "Code", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare code: string;

  @Searchable()
  @Select()
  @Listable()
  @Column({
    name: "Name",
    type: new DefaultDataTypes.StringType({ placeholder: "Department name" }),
    filterable: true,
  })
  @Access(AccessMode.ReadWrite)
  declare name: string;
}

@RegisterDataController()
export class relMemberDataAPI extends DataController(
  RelMember,
  TableViewRoutes.All,
  Controller("/api/rel-member"),
) {
  @ModelReference()
  @Model(RelMemberModel)
  declare model: RelMemberModel;

  @Select()
  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Select()
  @Listable()
  @Access(AccessMode.ReadOnly)
  declare userId: string;

  @Select(["userId"])
  @Listable(["userId"])
  @Searchable()
  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Sortable({ noIndex: true })
  @Joined({ table: RelUser, localKey: "userId", remoteField: "name" })
  declare name: string;
}

@RegisterDataController()
export class relAssignDataAPI extends DataController(
  RelAssign,
  TableViewRoutes.All,
  Controller("/api/rel-assign"),
) {
  @ModelReference()
  @Model(RelAssignModel)
  declare model: RelAssignModel;

  @Select()
  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Select()
  @Column({
    name: "Dept (by _id)",
    type: new DefaultDataTypes.RelationType({
      dataApiController: relDeptDataAPI,
      keyMapping: { label: "name", value: "_id" },
    }),
    order: 1,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare deptById: string;

  @Listable()
  @Select()
  @Column({
    name: "Dept (by code)",
    type: new DefaultDataTypes.RelationType({
      dataApiController: relDeptDataAPI,
      index: "code",
      keyMapping: { label: "name", value: "code" },
    }),
    order: 2,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare deptByCode: string;

  @Listable()
  @Select()
  @Column({
    name: "Member (by _id)",
    type: new DefaultDataTypes.RelationType({
      dataApiController: relMemberDataAPI,
      keyMapping: { label: "name", value: "_id" },
    }),
    order: 3,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare memberById: string;

  @Listable()
  @Select()
  @Column({
    name: "Member (by userId)",
    type: new DefaultDataTypes.RelationType({
      dataApiController: relMemberDataAPI,
      index: "userId",
      keyMapping: { label: "name", value: "userId" },
    }),
    order: 4,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare memberByUserId: string;
}
