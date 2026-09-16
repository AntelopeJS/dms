import {
  BasicDataModel,
  Field,
  Fixture,
  Index,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

const userTableName = "playground_rel_users";
const memberTableName = "playground_rel_members";
const deptTableName = "playground_rel_depts";
const assignTableName = "playground_rel_assignments";

interface UserSeed {
  _id: string;
  name: string;
}
const defaultUsers: UserSeed[] = [
  { _id: "u-alice", name: "Alice Martin" },
  { _id: "u-bob", name: "Bob Durand" },
  { _id: "u-carol", name: "Carol Petit" },
];

@RegisterTable(userTableName, CORE_SCHEMA_NAME)
@Fixture(() => defaultUsers)
export class RelUser extends Table {
  @Field("string") declare _id: string;
  @Field("string") declare name: string;
}

interface MemberSeed {
  _id: string;
  userId: string;
}
const defaultMembers: MemberSeed[] = [
  { _id: "m-1", userId: "u-alice" },
  { _id: "m-2", userId: "u-bob" },
  { _id: "m-3", userId: "u-carol" },
];

@RegisterTable(memberTableName, CORE_SCHEMA_NAME)
@Fixture(() => defaultMembers)
export class RelMember extends Table {
  @Field("string") declare _id: string;
  @Index()
  @Field("string")
  @Relation({ to: () => RelUser })
  declare userId: string;
}
export class RelMemberModel extends BasicDataModel(
  RelMember,
  memberTableName,
) {}

interface DeptSeed {
  _id: string;
  code: string;
  name: string;
}
const defaultDepts: DeptSeed[] = [
  { _id: "dept-eng", code: "ENG", name: "Engineering" },
  { _id: "dept-sales", code: "SALES", name: "Sales" },
  { _id: "dept-ops", code: "OPS", name: "Operations" },
];

@RegisterTable(deptTableName, CORE_SCHEMA_NAME)
@Fixture(() =>
  defaultDepts.map((dept) => ({
    ...dept,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
)
export class RelDept extends Table {
  @Field("string") declare _id: string;
  @Index() @Field("string") declare code: string;
  @Field("string") declare name: string;
  @Index() @Field("date") declare createdAt: Date;
  @Index() @Field("date") declare updatedAt: Date;
}
export class RelDeptModel extends BasicDataModel(RelDept, deptTableName) {}

interface AssignSeed {
  _id: string;
  deptById: string;
  deptByCode: string;
  memberById: string;
  memberByUserId: string;
}
const defaultAssignments: AssignSeed[] = [
  {
    _id: "assign-1",
    deptById: "dept-eng",
    deptByCode: "ENG",
    memberById: "m-1",
    memberByUserId: "u-alice",
  },
  {
    _id: "assign-2",
    deptById: "dept-sales",
    deptByCode: "SALES",
    memberById: "m-2",
    memberByUserId: "u-bob",
  },
  {
    _id: "assign-3",
    deptById: "dept-ops",
    deptByCode: "OPS",
    memberById: "m-3",
    memberByUserId: "u-carol",
  },
];

@RegisterTable(assignTableName, CORE_SCHEMA_NAME)
@Fixture(() =>
  defaultAssignments.map((assign) => ({
    ...assign,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
)
export class RelAssign extends Table {
  @Field("string") declare _id: string;
  @Field("string") @Relation({ to: () => RelDept }) declare deptById: string;
  @Field("string")
  @Relation({ to: () => RelDept, toField: "code" })
  declare deptByCode: string;
  @Field("string")
  @Relation({ to: () => RelMember })
  declare memberById: string;
  @Field("string")
  @Relation({ to: () => RelMember, toField: "userId" })
  declare memberByUserId: string;
  @Index() @Field("date") declare createdAt: Date;
  @Index() @Field("date") declare updatedAt: Date;
}
export class RelAssignModel extends BasicDataModel(
  RelAssign,
  assignTableName,
) {}
