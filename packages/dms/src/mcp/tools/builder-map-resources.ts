import {
  type CellDisplay,
  type ColumnDisplay,
  MapResources,
  type MapResourcesInput,
  type MapResourcesResult,
  type MappedResource,
  type OpResult,
  PreviewMapResources,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { repeatConfirmation } from "../confirmation-gate";
import { defineTool, type McpToolResult, textResult } from "../tool";
import { opResult, redactedOpResult } from "./builder-shared";
import { CELL_DISPLAY, COLUMN_PRESENTATION } from "./builder-resources";
import { TABLE_VIEW_SETTINGS } from "./builder-table-view";
import { BOUND_MODULE, CONNECTION } from "./builder-connection-access";

const UNAPPROVED_PAGES_PREFIX = "pages not approved for removal";

const MAPPED_FIELD = z.object({
  column: z.string(),
  declared: z
    .string()
    .optional()
    .describe(
      "One of the column's `accepts`, from the proposal or database_describe; the first by default.",
    ),
  label: z.string().optional(),
  listable: z.boolean().optional(),
  filterable: z.boolean().optional(),
  sortable: z.boolean().optional(),
  searchable: z.boolean().optional(),
  relation: z
    .string()
    .nullable()
    .optional()
    .describe(
      "`schema.name` of another relation in this call, or one the module mapped before: makes the column a relation column onto that relation's single-column key. Left out, a declared foreign key onto such a relation (with a TableView) becomes one anyway; null keeps the column a plain value.",
    ),
  display: z
    .union([
      z.object({
        kind: z.literal("badge"),
        values: z
          .number()
          .optional()
          .describe(
            "How many values the badge draws, as the proposal and builder_mapping show it; read, never written.",
          ),
        items: z
          .array(
            z.object({
              value: z.string(),
              label: z.string(),
              tone: z.enum([
                "neutral",
                "primary",
                "secondary",
                "success",
                "warning",
                "error",
                "info",
              ]),
            }),
          )
          .optional()
          .describe(
            "Never written into the code: a mapped badge reads its values from the column's rows when the page is served, labelled and toned by the DMS. Left out, the column is a badge when the relation's mapping holds one, else when its analysis proposes one; with neither, the column is written plain.",
          ),
      }),
      z.object({
        kind: z.literal("price"),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional()
          .describe(
            "ISO 4217 code of the amount (`USD`). Left out, the field is sent as if it left `display` out: it takes the display the relation's mapping holds or its analysis proposes, a price in the currency the column comment states, else in the one its relation's currency column holds, read from the rows when the page is served, and with neither it is written plain. Send a code to write a price neither holds; a relation with a currency column reads that column instead.",
          ),
      }),
      CELL_DISPLAY,
    ])
    .nullable()
    .optional()
    .describe(
      "How the column is drawn: a `badge` on a text column of few values, a `price` on an amount, or a cell display of the TableView `{ type, options }` over a column written without either. The proposal's display when left out, and on a relation mapped before the cell display its controller holds; `null` writes the column plain. A badge's values are never shown to you: send the badge back as the proposal or builder_mapping shows it, `{ kind: \"badge\", values: 3 }`.",
    ),
  ...COLUMN_PRESENTATION,
});

const MAPPED_RESOURCE = z.object({
  relation: z.string().describe("`schema.name`."),
  className: z.string().optional(),
  label: z
    .string()
    .optional()
    .describe(
      "The column relation columns pointing here show; also the TableView's labelKey.",
    ),
  title: z
    .string()
    .optional()
    .describe(
      "The page's title and the table's caption. Left out or blank, a new page takes the relation's name, humanized, and a page mapped before keeps its title.",
    ),
  category: z
    .string()
    .optional()
    .describe(
      "The id of a category made with builder_create_category, with this call's `module`: the page is written in it. A category that does not exist, or that another module declares, refuses this relation, naming it. Left out, a new page goes in the connection's category and a page mapped before stays where it is, even moved to another category: it is found by its table, not by its route. Sent on a page mapped before, it moves the page there, and its route changes.",
    ),
  tableView: z
    .boolean()
    .describe("False for a stats-only relation; forced false without a key."),
  writable: z
    .boolean()
    .describe(
      "False serves the TableView without new, edit and delete. True is refused while the connection's access is `read`.",
    ),
  fields: z.array(MAPPED_FIELD),
  tabs: z
    .object({ column: z.string() })
    .nullable()
    .optional()
    .describe(
      "Tabs above the table by a filterable badge column: All, then one per value. The proposal's tabs when left out; `null` writes none.",
    ),
  icon: z
    .string()
    .optional()
    .describe(
      "The page's menu icon, an icon name such as `i-ph-shopping-cart`.",
    ),
  description: z
    .string()
    .optional()
    .describe("What the page is for, in a sentence."),
  order: z
    .number()
    .optional()
    .describe(
      "Sorts the page among its category's pages, lowest first. 100 by default, so a dashboard created with order 0 comes before the mapped tables.",
    ),
  tableOptions: z
    .object(TABLE_VIEW_SETTINGS)
    .optional()
    .describe(
      "Displays (kanban, cards, grouped), views and footer figures for the page's table, with the same checks as builder_configure_table_view; a refused choice is a warning and the page keeps what it had.",
    ),
});

function unapprovedPagesRefusal(
  written: OpResult<MapResourcesResult>,
): McpToolResult | undefined {
  if (written.ok || written.error.code !== "invalid_config") return undefined;
  const issue = written.error.issues.find(({ message }) =>
    message.startsWith(UNAPPROVED_PAGES_PREFIX),
  );
  return issue === undefined ? undefined : textResult(issue.message, true);
}

const MAP_RESOURCES_INPUT = z.object({
  module: BOUND_MODULE,
  connection: CONNECTION,
  resources: z.array(MAPPED_RESOURCE),
  excluded: z
    .array(
      z.object({
        relation: z.string().describe("`schema.name`."),
        reason: z.string(),
      }),
    )
    .optional(),
});

type SentDisplay = z.infer<typeof MAPPED_FIELD>["display"];
type SentResource = z.infer<typeof MAPPED_RESOURCE>;

/**
 * A badge sent without its items, or a price without its currency, is the display the Builder
 * reads itself: left out.
 */
function displayInput(
  display: SentDisplay,
): ColumnDisplay | CellDisplay | null | undefined {
  if (display === undefined || display === null) return display;
  if (!("kind" in display)) return display;
  if (display.kind === "price") {
    return display.currency === undefined ? undefined : display;
  }
  return display.items === undefined
    ? undefined
    : { kind: "badge", items: display.items };
}

function resourceInput(resource: SentResource): MappedResource {
  return {
    ...resource,
    fields: resource.fields.map(({ display, ...field }) => {
      const sent = displayInput(display);
      return sent === undefined ? field : { ...field, display: sent };
    }),
  };
}

function withReadBadges(
  sent: z.infer<typeof MAP_RESOURCES_INPUT>,
): MapResourcesInput {
  return { ...sent, resources: sent.resources.map(resourceInput) };
}

export const mapResources = defineTool({
  name: "builder_map_resources",
  title: "Map resources",
  description:
    "Maps relations of a connected database into a project module bound to it (created with builder_configure_project): table classes and models with the database's names verbatim, DataAPI controllers and one TableView page per relation that has a key. Only your choices are sent: the Builder reads the relations' descriptions from its own catalog connection and checks every choice against them. A relation mapped before is rewritten from the new choices, its page created, kept or removed; a page you moved into a category with builder_configure_page is found by its table and updated where it is, never written again outside its category; a mapping that would remove a page asks the person first, listing it, and a denial writes nothing, and a page that appeared after the person approved is never removed: that write is refused, so call again to ask. `excluded` records relations decided against, so the next analysis does not propose them. A connection is read-only unless the dms-database entry of antelope.config.ts sets `config.externalConnections.<id>.access` to `read-write`: on a read-only one, a `writable: true` resource with a TableView is refused, and so are a ResourceForm that creates or edits its rows and a block over a table that still serves write routes. builder_set_connection_access changes it, once the person agrees. A relation the database account may not insert, update or delete in is mapped read-only even when asked `writable: true`, with a `relation_read_only` warning. Answers the files it wrote, without their diffs, and `leftOut`: columns a TableView cannot show, with why.",
  effect: "builder",
  input: MAP_RESOURCES_INPUT,
  async run(sent, sessionId) {
    const input = withReadBadges(sent);
    const preview = await PreviewMapResources(input);
    if (!preview.ok) return opResult(preview);
    const { pagesToRemove } = preview.data;
    const write = async () => {
      const written = await MapResources({
        ...input,
        approvedPageRemovals: pagesToRemove,
      });
      return (
        unapprovedPagesRefusal(written) ??
        redactedOpResult(written, (data) => data)
      );
    };
    return pagesToRemove.length === 0
      ? write()
      : repeatConfirmation.run(
          sessionId,
          "builder_map_resources",
          { ...sent, pagesToRemove },
          write,
        );
  },
});
