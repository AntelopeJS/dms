import { strict as assert } from "node:assert";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  TenantMemberModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import { RegisterHtmlTemplate } from "@antelopejs/interface-dms/html-render";
import type {
  ActionType,
  ExecutionCtx,
} from "@antelopejs/interface-dms-automation";
import {
  ACTIONS,
  INVITE_USER_ACTION_ID,
  SEND_EMAIL_ACTION_ID,
  SEND_NOTIFICATION_ACTION_ID,
} from "../../automation";
import { UserNotificationsModel } from "../../db";
import { resetDatabase } from "../helpers/db";
import { captureEmails, renderedEmails, sentEmails } from "../helpers/emails";

const TEMPLATE = "automation-dry-run-test";
const EMAIL = "dry-run@automation.test";
const USER = "automation-dry-run-user";
const ROLE = "automation-dry-run-role";

const ctx: ExecutionCtx = {
  procedureId: "procedure",
  runId: "run",
  nodeId: "node",
  dryRun: true,
  log: () => undefined,
};

function dryRun(id: string, input: Parameters<ActionType["execute"]>[0]) {
  const action: ActionType | undefined = ACTIONS.find(
    (candidate) => candidate.id === id,
  );
  if (!action?.dryRun) throw new Error(`${id} declares no dryRun`);
  return action.dryRun(input, ctx);
}

async function addMember(userId: string, roleIds: string[]) {
  await GetModel(TenantMemberModel, DEFAULT_TENANT_ID)
    .table.insert({ userId, roleIds })
    .run();
}

describe("Automation actions in a test run", () => {
  before(() => {
    captureEmails();
    RegisterHtmlTemplate(TEMPLATE);
  });

  beforeEach(async () => {
    await resetDatabase();
    renderedEmails.length = 0;
    sentEmails.length = 0;
  });

  it("dms.send-email renders and sends nothing, and still refuses a bad body", async () => {
    const output = await dryRun(SEND_EMAIL_ACTION_ID, {
      to: EMAIL,
      subject: "Hello",
      template: TEMPLATE,
    });

    assert.deepEqual(output, { success: true });
    assert.equal(renderedEmails.length, 0);
    assert.equal(sentEmails.length, 0);
    await assert.rejects(
      dryRun(SEND_EMAIL_ACTION_ID, {
        to: EMAIL,
        subject: "Hello",
        template: "never-registered",
      }),
      /no HTML template is registered/,
    );
  });

  it("dms.send-notification notifies nobody, and still refuses a bad input", async () => {
    await addMember(USER, [ROLE]);

    const output = await dryRun(SEND_NOTIFICATION_ACTION_ID, {
      userId: USER,
      roleIds: [ROLE],
      title: "Report ready",
      tone: "success",
    });

    assert.deepEqual(output, { ok: true });
    assert.deepEqual(
      await GetModel(UserNotificationsModel).getByUserId(USER),
      [],
    );
    await assert.rejects(
      dryRun(SEND_NOTIFICATION_ACTION_ID, {
        userId: USER,
        title: "Report ready",
        tone: "loud",
      }),
      /unknown tone "loud"/,
    );
  });

  it("dms.invite-user reports what an invite would do and changes nothing", async () => {
    assert.deepEqual(await dryRun(INVITE_USER_ACTION_ID, { email: EMAIL }), {
      kind: "invited",
    });

    await GetModel(UserModel).table.insert({ _id: USER, email: EMAIL }).run();
    assert.deepEqual(await dryRun(INVITE_USER_ACTION_ID, { email: EMAIL }), {
      kind: "added",
      userId: USER,
    });

    await addMember(USER, []);
    assert.deepEqual(await dryRun(INVITE_USER_ACTION_ID, { email: EMAIL }), {
      kind: "already-member",
      userId: USER,
    });

    assert.equal(await GetModel(UserInviteModel).table.count().run(), 0);
    assert.equal(
      await GetModel(TenantMemberModel, DEFAULT_TENANT_ID).table.count().run(),
      1,
    );
    assert.equal(sentEmails.length, 0);
  });
});
