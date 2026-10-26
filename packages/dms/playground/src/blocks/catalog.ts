import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  Banner,
  CodeBlock,
  KeyValueList,
  StatGroup,
} from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { blocksCategory } from "./category";

const CATALOG_API = "/api/blocks/catalog";
const CATALOG_PAGE = "/blocks/blocks-catalog";
const SCHEMA_MAX_LINES = 24;
const NO_TYPE_PICKED =
  "No block type picked yet: choose KpiCard, Guard or Card in the banner above, or add ?type=<BlockType> to the URL.";

@RegisterPage()
export class PageBlocksCatalog extends PageController("blocks-catalog", {
  displayName: "Block catalog",
  icon: "i-ph-books",
  category: blocksCategory,
  order: 90,
  description:
    "The block registry a page editor reads: every registered block type, the option schema of one (pick a type), options validated against a schema, and the registered data sources.",
}) {
  static stats = StatGroup({
    layout: "joined",
    columns: 3,
    fetchUrl: `${CATALOG_API}/stats`,
    skeletonCount: 3,
  });

  static pick = Banner({
    tone: "info",
    size: "sm",
    title: "Pick a block type",
    description:
      "Each row below opens its descriptor: GetBlockType(type), the options an editor draws.",
    actions: [
      { label: "KpiCard", to: `${CATALOG_PAGE}?type=KpiCard` },
      { label: "Guard", to: `${CATALOG_PAGE}?type=Guard` },
      { label: "Card", to: `${CATALOG_PAGE}?type=Card` },
    ],
  });

  static details = Grid({ gap: "1rem", minColumnWidth: "360px" }).child(
    "row",
    GridRow()
      .child(
        "types",
        KeyValueList({
          title: "ListBlockTypes()",
          dense: true,
          fetchUrl: `${CATALOG_API}/types`,
        }),
      )
      .child(
        "schema",
        CodeBlock({
          title: "GetBlockType(?type)",
          maxLines: SCHEMA_MAX_LINES,
          code: NO_TYPE_PICKED,
          wrap: true,
          fetchUrl: `${CATALOG_API}/types/{{query.type}}`,
        }),
      ),
  );

  static checks = Grid({ gap: "1rem", minColumnWidth: "360px" }).child(
    "row",
    GridRow()
      .child(
        "validation",
        KeyValueList({
          title: 'ValidateBlockOptions("TopListCard", …)',
          fetchUrl: `${CATALOG_API}/validation`,
        }),
      )
      .child(
        "sources",
        KeyValueList({
          title: "ListDataSources()",
          fetchUrl: `${CATALOG_API}/sources`,
          empty: { title: "No data source registered" },
        }),
      ),
  );
}
