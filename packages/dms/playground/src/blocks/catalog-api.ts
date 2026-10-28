import { Controller, Get, Parameter } from "@antelopejs/interface-api";
import {
  type BlockTypeDescriptor,
  GetBlockType,
  ListBlockTypes,
  ValidateBlockOptions,
} from "@antelopejs/interface-dms/base/block-registry";
import {
  ListDataSources,
  RegisterDataSource,
} from "@antelopejs/interface-dms/base/data-sources";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base/key-value-list";
import type { StatGroupItem } from "@antelopejs/interface-dms/base/stat-group";
import { notFound } from "./demo-errors";

const JSON_INDENT = 2;

RegisterDataSource({
  id: "playground.sales",
  title: "Sales",
  description: "Daily sales of the playground dashboard",
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- DataSourceDefinition.responseShape is the external RegisterDataSource contract.
  responseShape: "card",
  path: "/api/dashboard/sales",
  period: { from: "from", to: "to" },
});

RegisterDataSource({
  id: "playground.top-routes",
  title: "Slowest routes",
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- DataSourceDefinition.responseShape is the external RegisterDataSource contract.
  responseShape: "items",
  path: "/api/dashboard/top/routes",
});

const VALID_OPTIONS = { title: "Top products", showRank: true };
const INVALID_OPTIONS = { title: 42, highlightTopN: "three" };

function typeRow(descriptor: BlockTypeDescriptor): KeyValueListItem {
  const traits = [
    descriptor.meta.group ?? "ungrouped",
    descriptor.container ? "container" : "leaf",
    `${Object.keys(descriptor.config).length} options`,
  ];
  return {
    label: descriptor.meta.name,
    value: descriptor.type,
    type: "link",
    to: `/blocks/blocks-catalog?type=${descriptor.type}`,
    detail: traits.join(" · "),
  };
}

function validationRow(
  label: string,
  options: Parameters<typeof ValidateBlockOptions>[1],
): KeyValueListItem {
  const result = ValidateBlockOptions("TopListCard", options);
  return {
    label,
    value: result.valid ? "valid" : "invalid",
    type: "status",
    tone: result.valid ? "success" : "error",
    detail: result.valid
      ? JSON.stringify(options)
      : result.issues
          .map((issue) => `${issue.pointer} ${issue.message}`)
          .join("; "),
  };
}

function catalogStats(): StatGroupItem[] {
  const types = ListBlockTypes();
  return [
    { icon: "i-ph-cube", eyebrow: "Block types", value: types.length },
    {
      icon: "i-ph-stack",
      eyebrow: "Containers",
      value: types.filter((type) => type.container).length,
    },
    {
      icon: "i-ph-database",
      eyebrow: "Data sources",
      value: ListDataSources().length,
    },
  ];
}

/** The block registry and the data sources, read through the interface. */
export class BlocksCatalogApiController extends Controller(
  "/api/blocks/catalog",
) {
  @Get("stats")
  getStats() {
    return { items: catalogStats() };
  }

  @Get("types")
  getTypes() {
    return { items: ListBlockTypes().map(typeRow) };
  }

  @Get("types/:type")
  getType(@Parameter("type", "param") type: string) {
    const descriptor = GetBlockType(type);
    if (!descriptor) {
      throw notFound(`No block type is named ${type}.`, {
        title: "Unknown block type",
      });
    }
    return {
      code: JSON.stringify(descriptor, null, JSON_INDENT),
      language: "json",
    };
  }

  @Get("validation")
  getValidation() {
    return {
      items: [
        validationRow("Valid options", VALID_OPTIONS),
        validationRow("Invalid options", INVALID_OPTIONS),
      ],
    };
  }

  @Get("sources")
  getSources() {
    return {
      items: ListDataSources().map((source) => ({
        label: source.title,
        value: source.path,
        type: "mono",
        detail: `${source.id} · answers ${source.responseShape}${source.period ? " · takes a period" : ""}`,
      })),
    };
  }
}
