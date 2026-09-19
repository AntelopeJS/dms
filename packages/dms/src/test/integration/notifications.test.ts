import { strict as assert } from "node:assert";
import { sign } from "jsonwebtoken";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { MongoClient } from "mongodb";
import {
  UserNotificationPreferencesModel,
  UserNotificationsModel,
} from "../../db";
import { notifyOutdatedModules } from "../../dev/module-update-notifications";
import { internal } from "../../implementations/dms-notifications";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { internal as notificationInterface } from "@antelopejs/interface-dms/notifications";
import { SendableNotification } from "@antelopejs/interface-dms/notifications/sendable";
import type { NotificationData } from "@antelopejs/interface-dms/notifications/types";
import { buildUserNotificationTopic, getRealtimeBroker } from "../../realtime";
import { resetDatabase } from "../helpers/db";
import { createClient } from "../helpers/http";

const USER = "notification-user";
const OTHER_USER = "notification-other";
const EVENT = "budget:event:1";
const CONCURRENT_SENDS = 8;
const HTTP_USER = "notification-http-user";
const HTTP_AUTH_KEY = "notification-http-auth-key";
const HTTP_JWT_SECRET = "test-jwt-secret";

interface SeedDocument {
  _id: string;
  [key: string]: unknown;
}
const data: NotificationData = {
  icon: "i-ph-bell",
  title: "Budget alert",
  description: "Budget exceeded",
  subject: {
    id: "budget",
    labelKey: "budget",
    category: { id: "test", labelKey: "test", icon: "i-ph-bell" },
  },
  params: { amount: 100 },
};

async function seedHttpMember(): Promise<string> {
  const mongoUrl = process.env.TEST_MONGO_URL;
  assert.ok(mongoUrl);
  const client = await MongoClient.connect(mongoUrl);
  try {
    const database = client.db("dms-core");
    const collectionNames = (await database.listCollections().toArray()).map(
      (collection) => collection.name,
    );
    const usersCollection = collectionNames.find((name) =>
      name.endsWith("__users"),
    );
    const membersCollection = collectionNames.find((name) =>
      name.endsWith("__tenant_members"),
    );
    assert.ok(usersCollection);
    assert.ok(membersCollection);
    await database.collection<SeedDocument>(usersCollection).insertOne({
      _id: HTTP_USER,
      _instance: null,
      email: "notification-http@test.local",
      name: "HTTP Notification User",
      authKey: HTTP_AUTH_KEY,
      isValidated: true,
      owner: true,
      language: "en",
      avatar: null,
      password: null,
      twoFactorMethods: [],
      twoFactorSecret: null,
      twoFactorPendingSecret: null,
      twoFactorBackupCodes: [],
      twoFactorEmailCode: null,
      twoFactorEmailCodeRequestedAt: null,
      validationToken: null,
      validationRequestedAt: null,
      forgotPasswordToken: null,
      forgotPasswordRequestedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await database.collection<SeedDocument>(membersCollection).insertOne({
      _id: "notification-http-membership",
      _instance: DEFAULT_TENANT_ID,
      userId: HTTP_USER,
      roleIds: [],
      isTenantOwner: true,
      invitedBy: null,
      joinedAt: new Date(),
    });
  } finally {
    await client.close();
  }

  return sign(
    {
      id: HTTP_USER,
      tenantId: DEFAULT_TENANT_ID,
      purpose: "access",
    },
    `1:${HTTP_AUTH_KEY}:${HTTP_JWT_SECRET}`,
  );
}

describe("Notification idempotency (MongoDB adapter)", () => {
  let model: UserNotificationsModel;
  let sendable: SendableNotification;

  beforeEach(async () => {
    await resetDatabase();
    model = GetModel(UserNotificationsModel);
    internal.RegisterNotificationCategory.register(data.subject.category);
    internal.RegisterNotificationSubject.register(data.subject);
    sendable = new SendableNotification(data);
    for (const userId of [USER, OTHER_USER]) {
      await GetModel(UserNotificationPreferencesModel).createDefault(userId);
    }
  });

  it("serves empty authenticated notification reads over HTTP", async () => {
    const token = await seedHttpMember();
    const client = createClient();
    client.defaults.headers.common.Authorization = `Bearer ${token}`;

    const [count, preview, categories] = await Promise.all([
      client.get("/settings/user/notifications/unread-count"),
      client.get("/settings/user/notifications/unread-preview"),
      client.get("/settings/user/notifications/categories"),
    ]);

    assert.equal(count.status, 200, JSON.stringify(count.data));
    assert.deepEqual(count.data, { count: 0 });
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    assert.deepEqual(preview.data, []);
    assert.equal(categories.status, 200, JSON.stringify(categories.data));
  });

  it("atomically deduplicates concurrent sends and emits realtime only once", async () => {
    let published = 0;
    const unsubscribe = getRealtimeBroker().subscribe(
      buildUserNotificationTopic(USER),
      () => {
        published++;
      },
    );
    try {
      await Promise.all(
        Array.from({ length: CONCURRENT_SENDS }, () =>
          sendable.toUsersIdempotently([USER, USER], EVENT),
        ),
      );
      assert.equal((await model.getByUserId(USER)).length, 1);
      assert.equal(published, 1);
    } finally {
      unsubscribe();
    }
  });

  it("deduplicates concurrent module checks across order, dismissal and new recipients", async () => {
    await GetModel(UserModel).table.insert({ _id: USER }).run();
    const modules = [
      { package: "z-module", current: "1.0.0", latest: "2.0.0" },
      { package: "a-module", current: "3.0.0", latest: "4.0.0" },
    ];
    await Promise.all([
      notifyOutdatedModules(modules),
      notifyOutdatedModules([...modules].reverse().concat(modules[0])),
    ]);
    const [first] = await model.getByUserId(USER);
    assert.ok(first);
    assert.equal((await model.getByUserId(USER)).length, 1);
    assert.equal(first.params?.count, 2);
    assert.equal(
      first.params?.modules,
      "a-module 3.0.0 → 4.0.0, z-module 1.0.0 → 2.0.0",
    );
    await model.delete(first._id);
    await GetModel(UserModel).table.insert({ _id: OTHER_USER }).run();
    await notifyOutdatedModules(modules);
    assert.equal((await model.getByUserId(USER)).length, 0);
    assert.equal((await model.getByUserId(OTHER_USER)).length, 1);
    await notifyOutdatedModules([
      modules[0],
      { ...modules[1], latest: "5.0.0" },
    ]);
    assert.equal((await model.getByUserId(USER)).length, 1);
    assert.equal((await model.getByUserId(OTHER_USER)).length, 2);
  });

  it("preserves read and creation state on partial-recipient retry", async () => {
    await sendable.toUser(USER, { idempotencyKey: EVENT });
    const [first] = await model.getByUserId(USER);
    await model.markAsRead(first._id);
    const read = await model.get(first._id);
    assert.equal(read?.isRead, true);
    await sendable.toUsers([USER, OTHER_USER], { idempotencyKey: EVENT });
    assert.deepEqual(await model.get(first._id), read);
    assert.equal((await model.getByUserId(OTHER_USER)).length, 1);
  });

  it("keeps shared group identity stable across partial retries", async () => {
    await sendable.toUsersIdempotently([USER], EVENT, { readScope: "shared" });
    await sendable.toUsersIdempotently([USER, OTHER_USER], EVENT, {
      readScope: "shared",
    });
    const [first, second] = await model.getAll();
    assert.equal(first.groupId, second.groupId);
    assert.ok(first.groupId);
    await model.markAsRead(first._id);
    assert.equal(await model.countUnread(USER), 0);
    assert.equal(await model.countUnread(OTHER_USER), 0);
  });

  it("keeps event and recipient identities distinct, including empty keys", async () => {
    for (const key of [EVENT, "other-event", ""]) {
      await sendable.toUsersIdempotently([USER, OTHER_USER], key);
      await sendable.toUsersIdempotently([USER, OTHER_USER], key);
    }
    assert.equal((await model.getAll()).length, 6);
  });

  it("preserves unkeyed create results and physical deletion", async () => {
    await sendable.toUser(USER);
    await sendable.toUser(USER);
    const rows = await model.getByUserId(USER);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].title, data.title);
    assert.notEqual(rows[0]._id, rows[1]._id);
    await model.delete(rows[0]._id);
    assert.equal(await model.table.get(rows[0]._id).run(), undefined);
    await model.deleteAll(USER);
    assert.equal((await model.table.run()).length, 0);
  });

  it("retains a dismissed receipt and excludes it from all visible reads", async () => {
    await sendable.toUsersIdempotently([USER], EVENT);
    const [row] = await model.getByUserId(USER);
    await model.delete(row._id);
    await sendable.toUsersIdempotently([USER], EVENT);
    assert.equal(await model.get(row._id), undefined);
    assert.deepEqual(await model.getAll(), []);
    assert.deepEqual(await model.getBy("userId", USER), []);
    assert.deepEqual(await model.getByUserId(USER, 1, 0), []);
    assert.deepEqual(await model.getUnreadByUserId(USER), []);
    assert.deepEqual(await model.getBySubject("test", "budget"), []);
    assert.equal(await model.countUnread(USER), 0);
    const receipt = await model.table.get(row._id).run();
    await model.markAsRead(row._id);
    await model.markAllAsRead(USER);
    assert.deepEqual(await model.table.get(row._id).run(), receipt);
    assert.equal(receipt?.isDismissed, true);
  });

  it("bulk dismissal preserves keyed receipts while deleting legacy rows", async () => {
    await sendable.toUsersIdempotently([USER, OTHER_USER], EVENT);
    await sendable.toUser(USER);
    await model.deleteAll(USER);
    await sendable.toUsersIdempotently([USER, OTHER_USER], EVENT);
    assert.equal((await model.getByUserId(USER)).length, 0);
    assert.equal((await model.getByUserId(OTHER_USER)).length, 1);
    assert.equal((await model.table.run()).length, 2);
  });

  it("rejects an actual duplicate insert and mismatched notification identity", async () => {
    await sendable.toUsersIdempotently([USER], EVENT);
    const [row] = await model.table.run();
    await assert.rejects(model.table.insert(row).run(), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /E11000/);
      return true;
    });
    await assert.rejects(
      new SendableNotification({
        ...data,
        title: "Different",
      }).toUsersIdempotently([USER], EVENT),
    );
    assert.equal((await model.get(row._id))?.title, data.title);
  });

  it("recognizes a committed row after an uncertain acknowledgement", async () => {
    const original = model.create.bind(model);
    model.create = async (...args) => {
      await original(...args);
      throw new Error("lost acknowledgement");
    };
    try {
      assert.equal(
        await model.createIdempotently(USER, data, EVENT),
        undefined,
      );
    } finally {
      model.create = original;
    }
    assert.equal((await model.getByUserId(USER)).length, 1);
    assert.equal(await model.createIdempotently(USER, data, EVENT), undefined);
  });

  it("propagates insert failure without an exact existing receipt", async () => {
    const original = model.create.bind(model);
    const error = new Error("database unavailable");
    model.create = async () => {
      throw error;
    };
    try {
      await assert.rejects(
        model.createIdempotently(USER, data, EVENT),
        (actual) => actual === error,
      );
    } finally {
      model.create = original;
    }
  });

  it("retries a failed recipient without duplicating a successful recipient", async () => {
    await sendable.toUsersIdempotently([USER], EVENT);
    const mongoUrl = process.env.TEST_MONGO_URL;
    assert.ok(mongoUrl);
    const client = await MongoClient.connect(mongoUrl);
    const db = client.db("dms-core");
    const collections = await db.listCollections().toArray();
    const collection = collections.find((entry) =>
      entry.name.includes("user_notifications"),
    );
    assert.ok(collection);
    try {
      await db.command({
        collMod: collection.name,
        validator: { userId: { $ne: OTHER_USER } },
      });
      await assert.rejects(
        sendable.toUsersIdempotently([USER, OTHER_USER], EVENT),
      );
    } finally {
      await db.command({ collMod: collection.name, validator: {} });
      await client.close();
    }
    await sendable.toUsersIdempotently([USER, OTHER_USER], EVENT);
    assert.equal((await model.getByUserId(USER)).length, 1);
    assert.equal((await model.getByUserId(OTHER_USER)).length, 1);
  });

  it("forwards keys through role and broadcast sends", async () => {
    const roleId = "notification-role";
    await GetModel(TenantMemberModel, DEFAULT_TENANT_ID)
      .table.insert({ userId: USER, roleIds: [roleId] })
      .run();
    await GetModel(UserModel).table.insert({ _id: USER }).run();
    const options = { idempotencyKey: EVENT };
    await sendable.toRoles([roleId], options);
    await sendable.toRoles([roleId], options);
    assert.equal((await model.getByUserId(USER)).length, 1);
    await sendable.broadcast({
      idempotencyKey: "broadcast-event",
      readScope: "shared",
    });
    await sendable.broadcast({
      idempotencyKey: "broadcast-event",
      readScope: "shared",
    });
    assert.equal((await model.getByUserId(USER)).length, 2);
  });

  it("fails closed for a new sendable with an older implementation", async () => {
    const original = notificationInterface.SupportsIdempotency;
    Object.defineProperty(notificationInterface, "SupportsIdempotency", {
      value: async () => false,
      configurable: true,
    });
    try {
      const options = { idempotencyKey: EVENT };
      await assert.rejects(
        sendable.toUsersIdempotently([USER], EVENT),
        /unavailable/,
      );
      await assert.rejects(sendable.toUser(USER, options), /unavailable/);
      await assert.rejects(sendable.toUsers([USER], options), /unavailable/);
      await assert.rejects(sendable.toRoles(["role"], options), /unavailable/);
      await assert.rejects(sendable.broadcast(options), /unavailable/);
      assert.equal((await model.getAll()).length, 0);
      await sendable.toUser(USER);
      assert.equal((await model.getAll()).length, 1);
    } finally {
      Object.defineProperty(notificationInterface, "SupportsIdempotency", {
        value: original,
      });
    }
  });
});
