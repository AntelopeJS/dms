import { strict as assert } from "node:assert";
import { CROSS_INSTANCE } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  type TenantMember,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import type { NotificationData } from "@antelopejs/interface-dms/notifications/types";
import { UserNotificationsModel } from "../../db";
import { internal } from "../../implementations/dms-notifications";
import { resetDatabase } from "../helpers/db";

const RECIPIENT_PAGE_SIZE = 500;
const NOW = new Date("2026-06-01T00:00:00Z");
const data: NotificationData = {
  icon: "i-ph-bell",
  title: "Recipients",
  description: "Who receives it",
  subject: {
    id: "recipients",
    labelKey: "recipients",
    category: { id: "recipients", labelKey: "recipients", icon: "i-ph-bell" },
  },
};

const ADMIN = "recipients-admin";
const SUPPORT = "recipients-support";
const TENANTS = ["recipients-a", "recipients-b"];

function member(id: string, userId: string, roleIds: string[]): TenantMember {
  return {
    _id: id,
    userId,
    roleIds,
    isTenantOwner: false,
    joinedAt: NOW,
    invitedBy: null,
  };
}

async function recipients(): Promise<string[]> {
  const rows = await GetModel(UserNotificationsModel).table.run();
  return rows.map((row) => row.userId).sort();
}

function holdersInJs(members: TenantMember[], roleIds: string[]): string[] {
  const wanted = new Set(roleIds);
  const userIds = new Set<string>();
  for (const row of members) {
    if (row.roleIds?.some((roleId) => wanted.has(roleId))) {
      userIds.add(row.userId);
    }
  }
  return [...userIds].sort();
}

describe("Notification recipients (MongoDB adapter)", () => {
  beforeEach(async () => {
    await resetDatabase();
    for (const tenant of TENANTS) {
      await GetModel(TenantMemberModel, tenant).table.delete().run();
    }
    internal.RegisterNotificationCategory.register(data.subject.category);
    internal.RegisterNotificationSubject.register(data.subject);
    await GetModel(TenantMemberModel, "recipients-a").insert([
      member("a-1", "u-admin", [ADMIN]),
      member("a-2", "u-both", [ADMIN, SUPPORT]),
      member("a-3", "u-support", [SUPPORT]),
      member("a-4", "u-none", []),
      member("a-5", "u-other", ["other"]),
    ]);
    await GetModel(TenantMemberModel, "recipients-b").insert([
      member("b-1", "u-admin", [ADMIN]),
      member("b-2", "u-b-only", [SUPPORT]),
    ]);
  });

  it("sends to a role the members of one tenant the in-memory filter picked", async () => {
    const members = await GetModel(TenantMemberModel, "recipients-a").listAll();

    await internal.SendToRoles([ADMIN, SUPPORT], data, {
      tenantId: "recipients-a",
      dedupe: false,
    });

    const expected = holdersInJs(members, [ADMIN, SUPPORT]);
    assert.deepEqual(expected, ["u-admin", "u-both", "u-support"]);
    assert.deepEqual(await recipients(), expected);
  });

  it("sends once to a user holding the role in several tenants when read across them", async () => {
    const members = await GetModel(TenantMemberModel, CROSS_INSTANCE).listAll();

    await internal.SendToRoles([ADMIN, SUPPORT], data, { dedupe: false });

    const expected = holdersInJs(members, [ADMIN, SUPPORT]);
    assert.deepEqual(expected, ["u-admin", "u-b-only", "u-both", "u-support"]);
    assert.deepEqual(await recipients(), expected);
  });

  it("sends once to every user past the first pages", async function () {
    this.timeout(120_000);
    const userIds = Array.from(
      { length: 2 * RECIPIENT_PAGE_SIZE + 1 },
      (_, index) => `u-${String(index).padStart(5, "0")}`,
    );
    await GetModel(UserModel)
      .table.insert(userIds.map((_id) => ({ _id })))
      .run();

    await internal.SendToAll(data, "individual", undefined, { dedupe: false });

    assert.deepEqual(await recipients(), userIds);
  });
});
