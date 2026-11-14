import { GenerateHtml } from "@antelopejs/interface-dms/html-render";
import { Send } from "@antelopejs/interface-email";
import { expect } from "chai";
import {
  captureEmailsInSuite,
  renderedEmails,
  sentEmails,
} from "../helpers/emails";

const UNREACHABLE_SERVICE_TIMEOUT_MS = 20 * 1000;
const EMAIL = {
  to: "capture@test.local",
  subject: "Capture",
  html: "<p>capture</p>",
};
const TEMPLATE = { name: "EmailCaptureProbe" };
const PROPS = { name: "Ada" };

async function rejects(promise: Promise<string>): Promise<boolean> {
  try {
    await promise;
  } catch {
    return true;
  }
  return false;
}

describe("[integration] email capture, in a suite that asks for it", () => {
  captureEmailsInSuite();

  it("keeps what the suite renders and sends", async () => {
    expect(await GenerateHtml(TEMPLATE, PROPS)).to.equal("<p>email</p>");
    expect(await Send(EMAIL)).to.deep.equal({
      success: true,
      status: "sent",
    });
    expect(renderedEmails).to.deep.equal([
      { template: TEMPLATE.name, props: PROPS, language: undefined },
    ]);
    expect(sentEmails).to.deep.equal([EMAIL]);
  });
});

describe("[integration] email capture, once that suite is done", function () {
  this.timeout(UNREACHABLE_SERVICE_TIMEOUT_MS);

  it("sends through the harness's mail transport, which has no server", async () => {
    const captured = sentEmails.length;
    const result = await Send(EMAIL);
    expect(result.success).to.equal(false);
    expect(sentEmails).to.have.length(captured);
  });

  it("renders through the module, which has no render service", async () => {
    const captured = renderedEmails.length;
    expect(await rejects(GenerateHtml(TEMPLATE, PROPS))).to.equal(true);
    expect(renderedEmails).to.have.length(captured);
  });
});
