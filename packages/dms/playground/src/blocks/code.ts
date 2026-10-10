import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CodeBlock, EmptyState } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { blocksCategory } from "./category";

const FIELD_DECLARATION = `import { MediaField } from "@antelopejs/interface-media";

export class ArticleFields {
  // Images only, 5 MB at most, cropped to a square thumbnail.
  cover = MediaField({ accept: ["image/*"], maxSize: "5 MB", preset: "thumbnail" });
}`;

const SEND_REQUEST = `curl -X POST "$API_URL/api/mailing/send" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "to": "ada@example.com", "template": "welcome" }' # one recipient
echo "sent" | tee -a send.log`;

const OPEN_INVOICES = `SELECT id, customer, total
FROM invoices
WHERE status = 'open' AND total > 1000
ORDER BY total DESC
LIMIT 20;`;

const FIRST_EMAIL = `await sendMail({ to: "ada@example.com", template: "welcome" });`;

@RegisterPage()
export class PageBlocksCode extends PageController("blocks-code", {
  displayName: "Code",
  icon: "i-ph-code",
  category: blocksCategory,
  order: 70,
  description:
    "CodeBlock block (languages, copy button, max lines, wrap, a snippet read from a route) and an EmptyState with a snippet",
}) {
  static declaration = CodeBlock({
    title: "Field declaration",
    language: "typescript",
    code: FIELD_DECLARATION,
  });

  static snippets = Grid({ gap: "1rem", minColumnWidth: "320px" }).child(
    "row",
    GridRow()
      .child(
        "shell",
        CodeBlock({
          title: "Send through the API",
          language: "shell",
          code: SEND_REQUEST,
          wrap: true,
        }),
      )
      .child(
        "sql",
        CodeBlock({
          title: "Open invoices",
          language: "sql",
          code: OPEN_INVOICES,
          copy: false,
        }),
      ),
  );

  static fetched = CodeBlock({
    title: "Preset configuration (fetched)",
    maxLines: 6,
    fetchUrl: "/api/blocks/code",
  });

  static firstEmail = EmptyState({
    icon: "i-ph-paper-plane-tilt",
    tone: "primary",
    title: "No email sent yet",
    description:
      "Send your first email from your module, then watch it land here.",
    code: { language: "typescript", content: FIRST_EMAIL },
    actions: [{ label: "Read the guide", to: "https://antelopejs.com/docs" }],
  });
}
