import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  type DataControllerCallback,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Joined,
  Listable,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMember, TenantMemberModel } from "../db";
import { TenantScopedModel } from "../tenant-scoped-model";
import { User, UserModel } from "../auth/db";
import { DefaultDataTypes } from "../base/data-types/default-types";
import { StatusType } from "../base/data-types/status-type";
import { Searchable } from "../base/searchable";
import { Column, Exported, Select, TableViewRoutes } from "../base/table-view";
import { ReadonlyBehaviorType } from "../base/types";
import { getRequestTenantId } from "../request-tenant";
import { runTenantLifecycleOperation } from "../tenant-lifecycle";
import { roleSettingDataAPI } from "./roles";

const CONNECTED_THRESHOLD_MS = 5 * 60 * 1000;

const admittedMemberCreation: DataControllerCallback = {
  ...TableViewRoutes.New,
  async func(...args: Parameters<DataControllerCallback["func"]>) {
    const [ctx] = args;
    return runTenantLifecycleOperation(getRequestTenantId(ctx), () =>
      TableViewRoutes.New.func.apply(this, args),
    );
  },
};

export class memberSettingDataAPI extends DataController(
  TenantMember,
  { ...TableViewRoutes.All, new: admittedMemberCreation },
  Controller("/api/tables/members"),
) {
  @ModelReference()
  @TenantScopedModel(TenantMemberModel)
  declare model: TenantMemberModel;

  @Select()
  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare userId: string;

  @Select(["userId"])
  @Listable(["userId"])
  @Searchable()
  @Exported()
  @Column({
    name: "$page.settings.members.column.name",
    type: new DefaultDataTypes.StringType({
      placeholder: "$page.settings.members.placeholder.name",
    }),
    filterable: true,
  })
  @Sortable({ noIndex: true })
  @Joined({ table: User, localKey: "userId", remoteField: "name" })
  declare name: string;

  /**
   * User avatar exposed on the `select` endpoint so relation pickers targeting
   * DMS members can render it (see `RelationType.keyMapping.avatar`).
   */
  @Select(["userId"])
  @Joined({ table: User, localKey: "userId", remoteField: "avatar" })
  declare avatar: DefaultDataTypes.ImageValue | null;

  @Select(["userId"])
  @Listable(["userId"])
  @Searchable()
  @Exported()
  @Column({
    name: "$page.settings.members.column.email",
    type: new DefaultDataTypes.EmailType({
      placeholder: "$page.settings.members.placeholder.email",
    }),
    filterable: true,
  })
  @Sortable({ noIndex: true })
  @Joined({ table: User, localKey: "userId", remoteField: "email" })
  declare email: string;

  @Listable()
  @Column({
    name: "$page.settings.members.column.roles",
    type: new DefaultDataTypes.RelationType({
      multiple: true,
      placeholder: "$page.settings.members.placeholder.roles",
      dataApiController: roleSettingDataAPI,
      keyMapping: {
        label: "name",
        value: "_id",
      },
    }),
    description: "$page.settings.members.description.roles",
  })
  @Access(AccessMode.ReadWrite)
  declare roleIds: string[];

  @Listable()
  @Exported()
  @Column({
    name: "$page.settings.members.column.tenant_owner",
    type: new DefaultDataTypes.BooleanType(),
    description: "$page.settings.members.description.tenant_owner",
  })
  @Access(AccessMode.ReadWrite)
  declare isTenantOwner: boolean;

  @Listable()
  @Exported()
  @Column({
    name: "$page.settings.members.column.joined_at",
    type: new DefaultDataTypes.DateType(),
    description: "$page.settings.members.description.joined_at",
    readonlyBehavior: {
      edit: ReadonlyBehaviorType.disabled,
      view: ReadonlyBehaviorType.disabled,
      new: ReadonlyBehaviorType.hidden,
    },
  })
  @Sortable()
  @Access(AccessMode.ReadOnly)
  declare joinedAt: Date;

  @Listable(["userId"])
  @Exported()
  @Joined({ table: User, localKey: "userId", remoteField: "isValidated" })
  declare isValidated: boolean;

  @Listable(["userId"])
  @Column({
    name: "$page.settings.members.column.connected",
    type: new StatusType(),
    description: "$page.settings.members.description.connected",
  })
  @Access(AccessMode.ReadOnly)
  get connected(): PromiseLike<boolean> {
    return (
      GetModel(UserModel)
        // The source and the target do not overlap, so this cannot be one
        // assertion: the value reaches here through a decorator, a JWT
        // payload or a filter tuple, none of which the type system sees.
        // oxlint-disable-next-line anti-slop/no-chained-type-assertions
        .get((this as unknown as { table: { userId: string } }).table.userId)
        .then(
          (u) =>
            !!u &&
            new Date(u.updatedAt).getTime() >
              Date.now() - CONNECTED_THRESHOLD_MS,
        )
    );
  }
}
