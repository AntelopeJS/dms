import {
  type BlockCatalog,
  type BlockTypeDescriptor,
  type DataTypeDescriptor,
  GetCatalog,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { defineTool, textResult } from "../tool";
import { withEscalationNote } from "./builder-shared";

const DETAIL_HINT =
  'This is the index. Call builder_catalog again with `blocks: ["<type>", …]` and/or `dataTypes: ["<id>", …]` for the full config schema of the entries you will use.';

const CATALOG_NAMES = z.array(z.string()).optional();

const CatalogSelectionSchema = z.object({
  blocks: CATALOG_NAMES.describe(
    "Block types (e.g. `TableView`, `Grid`) whose full config schema to return.",
  ),
  dataTypes: CATALOG_NAMES.describe(
    "DataType ids (e.g. `select`, `relation`) whose full config schema to return.",
  ),
});

type CatalogSelection = z.infer<typeof CatalogSelectionSchema>;

function blockIndex(block: BlockTypeDescriptor) {
  return {
    type: block.type,
    description: block.description ?? block.label ?? "",
    group: block.group,
    container: block.container,
    controllerArg: block.controllerArg === true ? true : undefined,
  };
}

function dataTypeIndex(dataType: DataTypeDescriptor) {
  return {
    id: dataType.id,
    description: dataType.description,
    configKeys: Object.keys(dataType.config),
  };
}

function catalogIndex(catalog: BlockCatalog) {
  return {
    blocks: catalog.blocks.map(blockIndex),
    dataTypes: catalog.dataTypes.map(dataTypeIndex),
    reservedFieldNames: catalog.reservedFieldNames,
    generatedAt: catalog.generatedAt,
    detail: DETAIL_HINT,
  };
}

function pick<Entry>(
  entries: Entry[],
  names: string[] | undefined,
  nameOf: (entry: Entry) => string,
) {
  const wanted = names ?? [];
  const selected = entries.filter((entry) => wanted.includes(nameOf(entry)));
  const found = new Set(selected.map(nameOf));
  return { selected, unknown: wanted.filter((name) => !found.has(name)) };
}

function catalogDetail(catalog: BlockCatalog, selection: CatalogSelection) {
  const blocks = pick(catalog.blocks, selection.blocks, (block) => block.type);
  const dataTypes = pick(
    catalog.dataTypes,
    selection.dataTypes,
    (dataType) => dataType.id,
  );
  return {
    blocks: selection.blocks === undefined ? undefined : blocks.selected,
    unknownBlocks: blocks.unknown.length > 0 ? blocks.unknown : undefined,
    dataTypes:
      selection.dataTypes === undefined ? undefined : dataTypes.selected,
    unknownDataTypes:
      dataTypes.unknown.length > 0 ? dataTypes.unknown : undefined,
  };
}

function hasSelection(selection: CatalogSelection): boolean {
  return (
    (selection.blocks?.length ?? 0) > 0 ||
    (selection.dataTypes?.length ?? 0) > 0
  );
}

export const builderCatalogTool = defineTool({
  name: "builder_catalog",
  title: "Builder catalog",
  description: withEscalationNote(
    "The block types and DataTypes the page builder can emit. Without arguments it returns a compact index: each block type with a one-line description, its group, whether it is a `container` and whether it binds a resource (`controllerArg`); each DataType id with its config keys; and `reservedFieldNames`. Then pass `blocks` and/or `dataTypes` with the names you will use to get their full config schemas — always do so before adding or configuring a block of that type. For a config field whose schema is marked `x-dataType` (e.g. a Form field's `type`), pass a DataType value `{ $dataType: \"<id>\", config: {…} }` using an id and config from this catalog's `dataTypes` — never a raw `$expr`.",
  ),
  effect: "read",
  input: CatalogSelectionSchema,
  async run(selection) {
    const catalog = await GetCatalog();
    const answer = hasSelection(selection)
      ? catalogDetail(catalog, selection)
      : catalogIndex(catalog);
    return textResult(JSON.stringify(answer));
  },
});
