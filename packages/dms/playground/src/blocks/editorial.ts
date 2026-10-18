import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Hero, Prose } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { blocksCategory } from "./category";

// A self-contained illustration, so the image hero needs no file server.
const ILLUSTRATION = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300">
  <rect width="480" height="300" rx="18" fill="#eef2ff"/>
  <rect x="32" y="32" width="416" height="44" rx="10" fill="#fff"/>
  <rect x="32" y="96" width="196" height="172" rx="12" fill="#fff"/>
  <rect x="252" y="96" width="196" height="76" rx="12" fill="#fff"/>
  <rect x="252" y="192" width="196" height="76" rx="12" fill="#fff"/>
  <path d="M56 236 L96 196 L132 216 L196 140" stroke="#6366f1" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
)}`;

const GUIDE = `Everything below is one \`Prose\` block, written in Markdown.

## Import your data

Start from a **CSV export** of your previous tool: the importer reads the
header row and proposes a field for each column. Read the
[import guide](https://example.com/guide) for the formats it accepts, or open
the [Code blocks](/blocks/blocks-code) page of this playground.

> [!TIP]
> Import a small file first: you can undo an import for 24 hours.

### Check the mapping

1. Pick the resource to import into.
2. Match each column to a field.
3. Run a dry import and read the report.

- [x] Create the workspace
- [x] Invite the team
- [ ] Import the customers

> [!WARNING]
> An import replaces the records that share an id with a row of the file.

## Automate it

Send the file from your own system instead:

\`\`\`shell
curl -X POST "$API_URL/api/imports" -F file=@customers.csv
\`\`\`

| Format | Max size | Header row |
|:-------|---------:|:----------:|
| CSV    |    50 MB |  required  |
| XLSX   |    20 MB |  required  |
| JSON   |    10 MB |     –      |

---

> Raw HTML is never drawn: <span onclick="alert(1)">this text</span> keeps
> its words only, and a [script link](javascript:alert(1)) stays text.
`;

@RegisterPage()
export class PageBlocksEditorial extends PageController("blocks-editorial", {
  displayName: "Editorial",
  icon: "i-ph-article",
  category: blocksCategory,
  order: 72,
  description:
    "Hero and Prose blocks: a landing headline with highlighted words, actions, figures and media; then long-form Markdown with a table of contents, per-locale texts and a route answering Markdown in the reader's language.",
}) {
  static hero = Hero({
    eyebrow: "$demo.blocks.editorial.eyebrow",
    title: "$demo.blocks.editorial.title",
    lead: "$demo.blocks.editorial.lead",
    actions: [
      {
        label: "Read the guide",
        to: "#import-your-data",
        icon: "i-ph-book-open",
      },
      { label: "Code blocks", to: "/blocks/blocks-code" },
      { label: "AntelopeJS", to: "https://antelopejs.com" },
    ],
    proof: [
      { value: "2 min", label: "to set up" },
      { value: "99.9 %", label: "uptime last year" },
      {
        value: { key: "demo.blocks.editorial.teams", params: { count: 1240 } },
        label: "using it daily",
      },
    ],
    icons: ["i-ph-package", "i-ph-chart-line-up", "i-ph-users-three"],
    background: "gradient",
  });

  static variants = Grid({ gap: "1rem", minColumnWidth: "360px" }).child(
    "row",
    GridRow()
      .child(
        "centered",
        Hero({
          eyebrow: "Centred · card · medium",
          title: "Sell more, sell faster",
          highlight: "sell faster",
          lead: "The highlight option names the words to colour when the headline marks none.",
          actions: [{ label: "Start", to: "#" }],
          align: "center",
          size: "md",
          background: "card",
        }),
      )
      .child(
        "image",
        Hero({
          eyebrow: "Image below",
          title: "Your *weekly* report",
          lead: "The image sits under the texts with mediaPosition: below.",
          image: ILLUSTRATION,
          imageAlt: "A dashboard with a chart going up",
          mediaPosition: "below",
          size: "md",
          background: "card",
        }),
      ),
  );

  static guide = Prose({ toc: true, content: GUIDE });

  // One text per locale: switch the language to read the other one.
  static welcome = Prose({
    content: {
      "en-GB":
        "## One text per locale\n\nThis paragraph is written in **English**; switch to French to read its French text.",
      "fr-FR":
        "## Un texte par langue\n\nCe paragraphe est écrit en **français** ; passez en anglais pour lire sa version anglaise.",
    },
  });

  // The route answers `{ markdown }` in the language the request names.
  static fetched = Prose({
    width: "wide",
    fetchUrl: "/api/blocks/prose",
    fetchUrlMethod: HttpMethod.get,
  });
}
