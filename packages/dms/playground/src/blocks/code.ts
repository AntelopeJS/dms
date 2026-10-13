import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CodeBlock, EmptyState } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
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

const EMBED_SNIPPET = `<div id="acme-widget" data-theme="dark"></div>
<script src="https://cdn.acme.io/widget.js" async></script>`;

const BROWSER_SNIPPET = `const response = await fetch("/api/orders?status=paid");
const { results } = await response.json();
console.log(\`\${results.length} paid orders\`);`;

const RELEASE_NOTES = `v2.14 - 2026-10-01
- Saved views are shared with the team
- Exports keep the column order`;

const INSTALL_COMMAND = "pnpm add @acme/sdk";

const GENERATED_AT = "2026-10-01T08:30:00Z";

@RegisterPage()
export class PageBlocksCode extends PageController("blocks-code", {
  displayName: "Code",
  icon: "i-ph-code",
  category: blocksCategory,
  order: 70,
  description:
    "CodeBlock block: every language, with and without the copy button, max lines, wrap, a composed title and a snippet read from a route; then EmptyStates carrying a snippet.",
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

  static more = Grid({ gap: "1rem", minColumnWidth: "320px" }).child(
    "row",
    GridRow()
      .child(
        "html",
        CodeBlock({
          title: "Embed (html)",
          language: "html",
          code: EMBED_SNIPPET,
        }),
      )
      .child(
        "javascript",
        CodeBlock({
          title: "In the browser (javascript)",
          language: "javascript",
          code: BROWSER_SNIPPET,
        }),
      )
      .child(
        "text",
        CodeBlock({
          title: "Release notes (text, no copy)",
          language: "text",
          code: RELEASE_NOTES,
          copy: false,
        }),
      ),
  );

  // The title is composed in the reader's language, the snippet read from a
  // route answering `{ code, language }`.
  static fetched = CodeBlock({
    title: {
      key: "demo.blocks.code.generated",
      params: { at: { type: "date", value: GENERATED_AT, format: "short" } },
    },
    maxLines: 6,
    fetchUrl: "/api/blocks/code",
    fetchUrlMethod: HttpMethod.get,
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

  static install = EmptyState({
    size: "sm",
    title: "SDK not installed",
    description: "The snippet has no copy button: code.copy is false.",
    code: { language: "shell", content: INSTALL_COMMAND, copy: false },
  });
}
