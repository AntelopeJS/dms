import { strict as assert } from "node:assert";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { RegisterHtmlTemplate } from "@antelopejs/interface-dms/html-render";
import type {
  ActionType,
  ExecutionCtx,
} from "@antelopejs/interface-dms-automation";
import { ACTIONS, SEND_EMAIL_ACTION_ID } from "../../automation";
import { resetDatabase } from "../helpers/db";
import { captureEmails, renderedEmails, sentEmails } from "../helpers/emails";

const TEMPLATE = "automation-send-email-test";
const RECIPIENT = "recipient@automation.test";

const ctx: ExecutionCtx = {
  procedureId: "procedure",
  runId: "run",
  nodeId: "node",
  log: () => undefined,
};

const action = ACTIONS.find(({ id }) => id === SEND_EMAIL_ACTION_ID);

function send(input: Parameters<ActionType["execute"]>[0]) {
  if (!action) throw new Error(`${SEND_EMAIL_ACTION_ID} not registered`);
  return action.execute(input, ctx);
}

describe("Automation action dms.send-email", () => {
  before(() => {
    captureEmails();
    RegisterHtmlTemplate(TEMPLATE);
  });

  beforeEach(async () => {
    await resetDatabase();
    renderedEmails.length = 0;
    sentEmails.length = 0;
  });

  it("sends the literal HTML of existing procedures", async () => {
    await send({ to: RECIPIENT, subject: "Hello", html: "<p>Hi</p>" });

    assert.equal(renderedEmails.length, 0);
    assert.deepEqual(sentEmails, [
      { to: RECIPIENT, subject: "Hello", html: "<p>Hi</p>" },
    ]);
  });

  it("renders a registered template in the recipient's language", async () => {
    await GetModel(UserModel)
      .table.insert({ _id: "recipient", email: RECIPIENT, language: "fr" })
      .run();

    await send({
      to: RECIPIENT,
      subject: "Bonjour",
      template: TEMPLATE,
      props: { name: "Ada" },
    });

    assert.deepEqual(renderedEmails, [
      { template: TEMPLATE, props: { name: "Ada" }, language: "fr" },
    ]);
    assert.equal(sentEmails[0]?.html, "<p>email</p>");
  });

  it("renders in the language it is given", async () => {
    await send({
      to: RECIPIENT,
      subject: "Hallo",
      template: TEMPLATE,
      language: "de",
    });

    assert.deepEqual(renderedEmails, [
      { template: TEMPLATE, props: {}, language: "de" },
    ]);
  });

  it("refuses an unregistered template and a missing body", async () => {
    await assert.rejects(
      send({ to: RECIPIENT, subject: "Hi", template: "missing-template" }),
      /no HTML template is registered as "missing-template"/,
    );
    await assert.rejects(
      send({ to: RECIPIENT, subject: "Hi" }),
      /requires html or a template/,
    );
    assert.equal(sentEmails.length, 0);
  });
});
