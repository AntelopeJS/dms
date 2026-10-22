import { strict as assert } from "node:assert";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import type { ExecutionCtx } from "@antelopejs/interface-dms-automation";
import { ACTIONS } from "../../automation/actions";
import { SEND_NOTIFICATION_ACTION_ID } from "../../automation/send-notification";
import { UserNotificationsModel } from "../../db";
import { resetDatabase } from "../helpers/db";

const USER = "automation-notified-user";
const OTHER_USER = "automation-other-user";
const ROLE = "automation-role";
const OTHER_TENANT = "automation-other-tenant";

interface LogEntry {
  level: string;
  message: string;
}

const logs: LogEntry[] = [];

function ctx(nodeId = "node"): ExecutionCtx {
  return {
    procedureId: "procedure",
    runId: "run",
    nodeId,
    log: (level, message) => logs.push({ level, message }),
  };
}

const action = ACTIONS.find(({ id }) => id === SEND_NOTIFICATION_ACTION_ID);

function send(input: Record<string, unknown>, nodeId?: string) {
  if (!action) throw new Error(`${SEND_NOTIFICATION_ACTION_ID} not registered`);
  return action.execute(input, ctx(nodeId));
}

function inboxOf(userId: string) {
  return GetModel(UserNotificationsModel).getByUserId(userId);
}

async function addMember(tenantId: string, userId: string, roleIds: string[]) {
  await GetModel(TenantMemberModel, tenantId)
    .table.insert({ userId, roleIds })
    .run();
}

describe("Automation action dms.send-notification", () => {
  beforeEach(async () => {
    await resetDatabase();
    logs.length = 0;
  });

  it("keeps the title-and-description shape of existing procedures", async () => {
    await send({
      userIds: [USER],
      title: "Report ready",
      description: "Open it from the reports page",
    });

    const [notification] = await inboxOf(USER);
    assert.equal(notification?.title, "Report ready");
    assert.equal(notification?.description, "Open it from the reports page");
    assert.equal(notification?.icon, "i-ph-bell");
    assert.equal(notification?.tone, null);
  });

  it("stores translation keys with their params, tone and link", async () => {
    await send({
      userId: USER,
      title: "$my_app.notifications.order.title",
      description: "$my_app.notifications.order.body",
      params: { reference: "A-12", total: 42, paid: true, items: ["x"] },
      tone: "success",
      linkTo: "/orders/A-12",
    });

    const [notification] = await inboxOf(USER);
    assert.equal(notification?.title, "$my_app.notifications.order.title");
    assert.equal(notification?.description, "$my_app.notifications.order.body");
    assert.deepEqual(notification?.params, {
      reference: "A-12",
      total: 42,
      paid: "true",
    });
    assert.equal(notification?.tone, "success");
    assert.equal(notification?.linkTo, "/orders/A-12");
    assert.ok(logs.some(({ message }) => message.includes('"items"')));
  });

  it("refuses an unknown tone and params that are not an object", async () => {
    await assert.rejects(
      send({ userId: USER, title: "Hi", tone: "loud" }),
      /unknown tone "loud"/,
    );
    await assert.rejects(
      send({ userId: USER, title: "Hi", params: "A-12" }),
      /params must be an object/,
    );
    assert.equal((await inboxOf(USER)).length, 0);
  });

  it("requires a recipient", async () => {
    await assert.rejects(
      send({ userIds: [], roleIds: [], title: "Hi" }),
      /requires at least one of userId/,
    );
  });

  it("keeps a role send inside the tenant it names", async () => {
    await addMember(DEFAULT_TENANT_ID, USER, [ROLE]);
    await addMember(OTHER_TENANT, OTHER_USER, [ROLE]);

    await send({ roleIds: [ROLE], tenantId: OTHER_TENANT, title: "Scoped" });

    assert.equal((await inboxOf(USER)).length, 0);
    assert.equal((await inboxOf(OTHER_USER)).length, 1);
  });

  it("matches the roles in the default tenant without a tenantId", async () => {
    await addMember(DEFAULT_TENANT_ID, USER, [ROLE]);
    await addMember(OTHER_TENANT, OTHER_USER, [ROLE]);

    await send({ roleIds: [ROLE], title: "Default" });

    assert.equal((await inboxOf(USER)).length, 1);
    assert.equal((await inboxOf(OTHER_USER)).length, 0);
  });

  it("delivers a replayed event once per node with an idempotency key", async () => {
    const input = {
      userId: USER,
      title: "Welcome",
      idempotencyKey: "delivery-1",
    };
    await send(input);
    await send(input);
    await send(input, "other-node");

    assert.equal((await inboxOf(USER)).length, 2);
  });
});
