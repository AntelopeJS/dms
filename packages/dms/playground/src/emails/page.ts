import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CodeBlock, KeyValueList } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { systemSection } from "../sections";
import { EMAILS_DEMO_API } from "./api";

const PREVIEW_MAX_LINES = 30;

@RegisterPage()
export class EmailsPage extends PageController(
  "emails",
  {
    displayName: "Emails",
    icon: "i-ph-envelope",
    category: systemSection,
    order: 60,
    description:
      "Demonstrates: RegisterHtmlTemplate, GenerateHtml and EmailLayout from a module's dms.email.ts. The preview needs the frontend server running, which builds the email bundle.",
  },
  DefaultLayout(),
) {
  static preview = CodeBlock({
    title: 'GenerateHtml(EmailPlaygroundDigest, props, "fr")',
    language: "html",
    fetchUrl: `${EMAILS_DEMO_API}/preview`,
    maxLines: PREVIEW_MAX_LINES,
    wrap: true,
  });

  static templates = KeyValueList({
    title: "GetAllHtmlTemplates()",
    fetchUrl: `${EMAILS_DEMO_API}/templates`,
  });

  static files = KeyValueList({
    title: "Where the template lives",
    items: [
      {
        label: "Email entry",
        value: "playground/frontend-vue/dms.email.ts",
        type: "mono",
        detail: "Exports serverEmailTemplates, a glob of app/emails/**/*.vue.",
      },
      {
        label: "Template",
        value: "app/emails/EmailPlaygroundDigest.vue",
        type: "mono",
        detail:
          'EmailLayout with :divider="false", public-logo-only, a preheader and the #head and #footer slots.',
      },
      {
        label: "Backend",
        value:
          'RegisterHtmlTemplate<{ userName, count }>("EmailPlaygroundDigest")',
        type: "mono",
      },
    ],
  });
}
