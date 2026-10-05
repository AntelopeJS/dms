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
import { TenantMember, TenantMemberModel } from "../db";
import { TenantScopedModel } from "../tenant-scoped-model";
import { User } from "../auth/db";
import { DefaultDataTypes } from "../base/data-types/default-types";
import { Searchable } from "../base/searchable";
import {
  Column,
  DefaultDisplays,
  Exported,
  Select,
  TableViewRoutes,
} from "../base/table-view";
import { ReadonlyBehaviorType } from "../base/types";
import { getRequestTenantId } from "../request-tenant";
import { runTenantLifecycleOperation } from "../tenant-lifecycle";
import { roleSettingDataAPI } from "./roles";

const ROLE_KEY_MAPPING = { label: "name", value: "_id" } as const;

/** "Active now" lasts this long after the member's last request. */
const ACTIVE_NOW_MS = 5 * 60 * 1000;

const SYSTEM_MANAGED_FIELD = {
  edit: ReadonlyBehaviorType.hidden,
  view: ReadonlyBehaviorType.disabled,
  new: ReadonlyBehaviorType.hidden,
};

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
    name: "$page.settings.members.column.member",
    type: new DefaultDataTypes.StringType({
      placeholder: "$page.settings.members.placeholder.name",
    }),
    filterable: true,
    size: 300,
    // Avatar, name, a "You" tag, the unverified-email badge and the address.
    display: new DefaultDisplays.IdentityDisplay({
      avatarField: "avatar",
      subtitleField: "email",
      selfField: "userId",
      selfLabel: "$page.settings.members.you",
      badges: [
        {
          field: "isValidated",
          equals: false,
          label: "$page.settings.members.email_not_verified",
          tone: "warning",
        },
      ],
    }),
  })
  @Sortable({ noIndex: true })
  @Joined({ table: User, localKey: "userId", remoteField: "name" })
  declare name: string;

  /**
   * User avatar, on the `select` endpoint so relation pickers targeting DMS
   * members can render it (see `RelationType.keyMapping.avatar`), and in the
   * list for the members page.
   */
  @Select(["userId"])
  @Listable(["userId"])
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
    // Drawn under the name, in the member cell.
    isVisible: false,
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
      keyMapping: ROLE_KEY_MAPPING,
    }),
    description: "$page.settings.members.description.roles",
    filterable: true,
    size: 180,
    // An owner holds every permission: one crown pill replaces the roles.
    display: new DefaultDisplays.PillsDisplay({
      exclusive: {
        field: "isTenantOwner",
        label: "$page.settings.members.owner",
        icon: "i-ph-crown",
      },
      emptyLabel: "$page.settings.members.no_role",
    }),
  })
  @Access(AccessMode.ReadWrite)
  declare roleIds: string[];

  @Listable()
  @Exported()
  @Column({
    name: "$page.settings.members.column.tenant_owner",
    type: new DefaultDataTypes.BooleanType(),
    description: "$page.settings.members.description.tenant_owner",
    // Drawn as the crown pill of the roles cell.
    isVisible: false,
  })
  @Access(AccessMode.ReadWrite)
  declare isTenantOwner: boolean;

  /**
   * Last time the member used the dashboard, from `User.lastActiveAt`. `null`
   * for a member who never signed in.
   */
  @Listable(["userId"])
  @Exported()
  @Column({
    name: "$page.settings.members.column.last_active",
    type: new DefaultDataTypes.DateType(),
    description: "$page.settings.members.description.last_active",
    readonlyBehavior: SYSTEM_MANAGED_FIELD,
    size: 140,
    display: new DefaultDisplays.RelativeDateDisplay({
      nowWithinMs: ACTIVE_NOW_MS,
      nowLabel: "$page.settings.members.active_now",
      emptyLabel: "$page.settings.members.never_signed_in",
      emptyTone: "warning",
    }),
  })
  @Sortable({ noIndex: true })
  @Joined({ table: User, localKey: "userId", remoteField: "lastActiveAt" })
  declare lastActiveAt: Date | null;

  /**
   * Second factors the member enabled (`totp`, `email`); empty when two-factor
   * authentication is off. The secrets themselves never leave the user row.
   */
  @Listable(["userId"])
  @Column({
    name: "$page.settings.members.column.two_factor",
    type: new DefaultDataTypes.SelectType({
      multiple: true,
      items: [
        { value: "totp", label: "$page.settings.members.two_factor.totp" },
        { value: "email", label: "$page.settings.members.two_factor.email" },
      ],
    }),
    readonlyBehavior: SYSTEM_MANAGED_FIELD,
    size: 110,
    display: new DefaultDisplays.IndicatorDisplay({
      onLabel: "$page.settings.members.two_factor_on",
      offLabel: "$page.settings.members.two_factor_off",
      onIcon: "i-ph-shield-check",
      offIcon: "i-ph-shield",
    }),
  })
  @Access(AccessMode.ReadOnly)
  @Joined({ table: User, localKey: "userId", remoteField: "twoFactorMethods" })
  declare twoFactorMethods: string[] | null;

  @Listable()
  @Exported()
  @Column({
    name: "$page.settings.members.column.joined_at",
    type: new DefaultDataTypes.DateType(),
    description: "$page.settings.members.description.joined_at",
    size: 130,
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
}
