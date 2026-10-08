import { ImplementInterface } from "@antelopejs/interface-core";
import {
  GenerateHtml,
  type HtmlTemplateRef,
} from "@antelopejs/interface-dms/html-render";
import { Send } from "@antelopejs/interface-email";

const POLL_INTERVAL_MS = 20;
const POLL_ATTEMPTS = 50;

export interface RenderedEmail {
  template: string;
  props: Record<string, unknown>;
}

export const renderedEmails: RenderedEmail[] = [];

/**
 * The harness has no render service, and the test mailbox needs the network:
 * emails are kept as the props they were rendered from, and every send
 * succeeds. Flows that await their email (two-factor codes) then answer.
 */
export function captureEmails(): void {
  ImplementInterface(
    { GenerateHtml },
    {
      GenerateHtml: async (template: HtmlTemplateRef, props: unknown) => {
        renderedEmails.push({
          template: template.name,
          props: props as Record<string, unknown>,
        });
        return "<p>email</p>";
      },
    },
  );
  ImplementInterface(
    { Send },
    { Send: async () => ({ success: true, status: "sent" as const }) },
  );
}

/** The last email rendered from `template` that `matches`, once it is. */
export async function lastRenderedEmail(
  template: string,
  matches: (props: Record<string, unknown>) => boolean = () => true,
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
