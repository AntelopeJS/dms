import { ImplementInterface } from "@antelopejs/interface-core";
import { ReloadModule } from "@antelopejs/interface-core/modules";
import {
  GenerateHtml,
  type HtmlTemplateRef,
} from "@antelopejs/interface-dms/html-render";
import { Send } from "@antelopejs/interface-email";
import { GenerateHtml as renderHtml } from "../../implementations/dms-html-render";

const MAIL_TRANSPORT_MODULE = "nodemailer";
const POLL_INTERVAL_MS = 20;
const POLL_ATTEMPTS = 50;

export interface RenderedEmail {
  template: string;
  props: object;
  language?: string;
}

function isObject<T>(value: T): value is T & object {
  return typeof value === "object" && value !== null;
}

export const renderedEmails: RenderedEmail[] = [];

export const sentEmails: Parameters<typeof Send>[0][] = [];

/**
 * Set by a test to have every email fail before it leaves, as a mail outage
 * does; the test sets it back once done. The failure is raised where the
 * email is rendered, while the suite captures its emails.
 */
export const emailOutage = { isOn: false };

/**
 * Captures the emails the enclosing suite renders and sends. The harness has
 * no render service, and the test mailbox needs the network: emails are kept
 * as the props they were rendered from, and every send succeeds. Flows that
 * await their email (two-factor codes) then answer. Once the suite is done,
 * the module's renderer and the harness's mail transport serve again.
 */
export function captureEmailsInSuite(): void {
  before(captureEmails);
  after(releaseEmails);
}

async function releaseEmails(): Promise<void> {
  ImplementInterface({ GenerateHtml }, { GenerateHtml: renderHtml });
  await ReloadModule(MAIL_TRANSPORT_MODULE);
}

function captureEmails(): void {
  renderedEmails.length = 0;
  sentEmails.length = 0;
  ImplementInterface(
    { GenerateHtml },
    {
      GenerateHtml: async <T>(
        template: HtmlTemplateRef<T>,
        props: T,
        language?: string,
      ) => {
        if (emailOutage.isOn) throw new Error("Email outage");
        if (!isObject(props)) {
          throw new Error(`Template ${template.name} rendered without props`);
        }
        renderedEmails.push({
          template: template.name,
          props,
          language,
        });
        return "<p>email</p>";
      },
    },
  );
  ImplementInterface(
    { Send },
    {
      Send: async (email: Parameters<typeof Send>[0]) => {
        sentEmails.push(email);
        return { success: true, status: "sent" as const };
      },
    },
  );
}

/** The last email rendered from `template` that `matches`, once it is. */
export async function lastRenderedEmail(
  template: string,
  matches: (props: RenderedEmail["props"]) => boolean = () => true,
): Promise<RenderedEmail | undefined> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const email = renderedEmails.findLast(
      (entry) => entry.template === template && matches(entry.props),
    );
    if (email) return email;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return undefined;
}
