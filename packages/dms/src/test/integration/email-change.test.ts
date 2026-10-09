import { ImplementInterface } from "@antelopejs/interface-core";
import {
  GenerateHtml,
  type HtmlTemplateRef,
} from "@antelopejs/interface-dms/html-render";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import {
  authorizedClient,
  type RegisteredUser,
  registerUser,
} from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { findUserByEmail, updateUserByEmail } from "../helpers/fixtures";

// Changing the sign-in email proves the new address with a code sent there,
// and warns the current one; the account moves only once the code comes back.

const SECURITY = "/settings/user/security";
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;
const CODE_TEMPLATE = "EmailChangeVerification";
const NOTICE_TEMPLATE = "EmailChangeNotice";
const MAX_CODE_ATTEMPTS = 5;
const TOO_MANY_ATTEMPTS = "error.email_change_too_many_attempts";
const POLL_INTERVAL_MS = 20;
const POLL_ATTEMPTS = 50;

interface EmailChangeProps {
  newEmail: string;
  code?: string;
}

interface RenderedEmail {
  template: string;
  props: EmailChangeProps;
}

const rendered: RenderedEmail[] = [];

// The harness has no render service: the emails are kept as the props they
// were rendered from (the mail provider still sends them, to Ethereal, after
// the request answered).
function captureRenderedEmails(): void {
  ImplementInterface(
    { GenerateHtml },
    {
      GenerateHtml: async (template: HtmlTemplateRef, props: unknown) => {
        rendered.push({
          template: template.name,
          props: props as EmailChangeProps,
        });
        return "<p>email</p>";
      },
    },
  );
}

function renderedWith(template: string, newEmail: string) {
  return rendered.find(
    (email) => email.template === template && email.props.newEmail === newEmail,
  );
}

// The emails leave in the background of the request.
async function renderedEventually(template: string, newEmail: string) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const email = renderedWith(template, newEmail);
    if (email) return email;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return undefined;
}

async function codeSentTo(newEmail: string): Promise<string> {
  const code = (await renderedEventually(CODE_TEMPLATE, newEmail))?.props.code;
  if (!code) throw new Error(`No code was sent to ${newEmail}`);
  return code;
}

describe("[integration] sign-in email change", () => {
  let user: RegisteredUser;
  let client: AxiosInstance;
  let newEmail: string;

  const currentEmail = async () =>
    (await client.get("/api/auth/me")).data.email as string;

  const request = () =>
    client.post(`${SECURITY}/email`, {
      email: newEmail,
      currentPassword: user.password,
    });

  const confirm = (code: string) =>
    client.post(`${SECURITY}/email/confirm`, { code });

  before(captureRenderedEmails);

  beforeEach(async () => {
    rendered.length = 0;
    await resetDatabase();
    user = await registerUser({ owner: true });
    client = authorizedClient(user.accessToken);
    newEmail = `moved-${Date.now()}@test.local`;
  });

  it("keeps the address until the new one is proven, and warns the current one", async () => {
    const response = await request();
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    expect(response.data.pendingEmail).to.equal(newEmail);
    expect(await currentEmail()).to.equal(user.email);
    expect(await codeSentTo(newEmail)).to.match(/^\d{6}$/);
    expect(await renderedEventually(NOTICE_TEMPLATE, newEmail)).to.not.equal(
      undefined,
    );
    const overview = await client.get(SECURITY);
    expect(overview.data.pendingEmail).to.equal(newEmail);
  });

  it("moves the account once the code comes back, not on a wrong one", async () => {
    await request();
    const code = await codeSentTo(newEmail);
    const wrong = code === "000000" ? "000001" : "000000";
    const refused = await client.post(`${SECURITY}/email/confirm`, {
      code: wrong,
    });
    expect(refused.status).to.equal(HTTP_BAD_REQUEST);
    expect(await currentEmail()).to.equal(user.email);

    const confirmed = await client.post(`${SECURITY}/email/confirm`, { code });
    expect(confirmed.status, JSON.stringify(confirmed.data)).to.equal(HTTP_OK);
    expect(await currentEmail()).to.equal(newEmail);
    expect((await client.get(SECURITY)).data.pendingEmail).to.equal(null);
  });

  it("sends the codes at most once a minute", async () => {
    await request();
    expect((await request()).status).to.equal(HTTP_TOO_MANY_REQUESTS);
  });

  it("keeps the once-a-minute limit through a cancel", async () => {
    await request();
    await client.delete(`${SECURITY}/email/pending`);
    expect((await request()).status).to.equal(HTTP_TOO_MANY_REQUESTS);
  });

  it("sends one code a minute to an address, whatever the account", async () => {
    await request();
    const other = await registerUser();
    const otherRequest = await authorizedClient(other.accessToken).post(
      `${SECURITY}/email`,
      { email: newEmail, currentPassword: other.password },
    );
    expect(otherRequest.status).to.equal(HTTP_TOO_MANY_REQUESTS);
  });

  it("burns the code after too many tries, the right one included", async () => {
    await request();
    const code = await codeSentTo(newEmail);
    const wrong = code === "000000" ? "000001" : "000000";
    for (let attempt = 1; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      expect((await confirm(wrong)).status).to.equal(HTTP_BAD_REQUEST);
    }
    const burnt = await confirm(wrong);
    expect(burnt.status).to.equal(HTTP_TOO_MANY_REQUESTS);
    expect(burnt.data).to.equal(TOO_MANY_ATTEMPTS);

    expect((await confirm(code)).status).to.equal(HTTP_BAD_REQUEST);
    expect(await currentEmail()).to.equal(user.email);
    expect((await client.get(SECURITY)).data.pendingEmail).to.equal(null);
  });

  it("marks the new address validated: the code proves it", async () => {
    await updateUserByEmail(user.email, { isValidated: false });
    await request();
    const confirmed = await confirm(await codeSentTo(newEmail));
    expect(confirmed.status, JSON.stringify(confirmed.data)).to.equal(HTTP_OK);
    expect((await findUserByEmail(newEmail)).isValidated).to.equal(true);
  });

  it("drops a cancelled change", async () => {
    await request();
    const code = await codeSentTo(newEmail);
    await client.delete(`${SECURITY}/email/pending`);
    const confirmed = await client.post(`${SECURITY}/email/confirm`, { code });
    expect(confirmed.status).to.equal(HTTP_BAD_REQUEST);
    expect(await currentEmail()).to.equal(user.email);
  });
});
