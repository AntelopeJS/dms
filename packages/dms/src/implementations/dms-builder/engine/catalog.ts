import type { DataSourceDefinition } from "@antelopejs/interface-dms/base/data-sources";
import type {
  BlockCatalog,
  BlockInitialChild,
  DataSourceDescriptor,
  BlockTypeDescriptor,
  ConfigSchema,
  DynamicSlots,
  OptionSchema,
  OptionWidget,
  SlotDescriptor,
} from "@antelopejs/interface-dms-builder";
import {
  inferBlocks,
  inferDataTypes,
  invalidateInference,
} from "./catalog-inference";
import { isIndexable } from "./guards";
import { loadModule } from "./module-loader";
import { RESERVED_FIELD_NAMES } from "./reserved-names";

const BASE_MODULE = "@antelopejs/interface-dms/base";
const BLOCK_TYPES_MODULE = `${BASE_MODULE}/block-types`;

/** The shape `dms-base` reports for one declared block type. */
interface DeclaredBlockType {
  type: string;
  componentName: string;
  meta: { name: string; icon?: string; description?: string; group?: string };
  container?: boolean;
  allowedChildren?: string[];
  slots?: SlotDescriptor[];
  dynamicSlots?: DynamicSlots;
  controllerArg?: boolean;
  config: ConfigSchema;
  childMeta?: ConfigSchema;
  defaults: NonNullable<BlockTypeDescriptor["defaults"]>;
  fixedOptions?: BlockTypeDescriptor["fixedOptions"];
  initialChildren?: BlockInitialChild[];
}

/** What the installed DMS reports for a declared source: the descriptor, with the kind of response under the DMS's own name. */
type DeclaredDataSource = Omit<DataSourceDescriptor, "responseKind"> &
  Pick<DataSourceDefinition, "responseShape">;

interface BlockTypesModule {
  ListBlockTypes: () => DeclaredBlockType[];
  ListDataSources: (response?: string) => DeclaredDataSource[];
}

let cached: BlockCatalog | undefined;

function isBlockTypesModule(value: unknown): value is BlockTypesModule {
  return (
    isIndexable(value) &&
    typeof value.ListBlockTypes === "function" &&
    typeof value.ListDataSources === "function"
  );
}

function blockTypesModule(): BlockTypesModule {
  const loaded = loadModule(BLOCK_TYPES_MODULE);
  if (!isBlockTypesModule(loaded)) {
    throw new TypeError(
      `${BLOCK_TYPES_MODULE} does not export ListBlockTypes and ListDataSources`,
    );
  }
  return loaded;
}

/** Read the block types `dms-base` declares. */
function loadDeclaredBlockTypes(): DeclaredBlockType[] {
  return blockTypesModule().ListBlockTypes();
}

/** The sources developers have declared beside their own routes. */
export function listDeclaredDataSources(
  response?: string,
): DataSourceDescriptor[] {
  return blockTypesModule()
    .ListDataSources(response)
    .map((source) => ({
      id: source.id,
      title: source.title,
      description: source.description,
      responseKind: source.responseShape,
      path: source.path,
      method: source.method,
      params: source.params,
      period: source.period,
    }));
}

const WIDGET_MARKERS = new Map<OptionWidget, string>([
  ["dataType", "x-dataType"],
  ["block", "x-component"],
]);

/**
 * Carry the `x-` markers the emitter and consumers key on: a declared schema
 * expresses them as widgets, an inferred one as the markers themselves.
 * A tuple's members and an intersection's branches carry hints like any other
 * node, so they are visited too; skipping them drops the marker on anything
 * nested there.
 */
function withMarkers(option: OptionSchema): OptionSchema {
  const marker = option.ui?.widget && WIDGET_MARKERS.get(option.ui.widget);
  const nested: OptionSchema = { ...option };
  if (option.properties) {
    nested.properties = mapOptions(option.properties);
  }
  if (option.items) {
    nested.items = withMarkers(option.items);
  }
  if (option.values) {
    nested.values = withMarkers(option.values);
  }
  if (option.oneOf) {
    nested.oneOf = option.oneOf.map(withMarkers);
  }
  if (option.prefixItems) {
    nested.prefixItems = option.prefixItems.map(withMarkers);
  }
  if (option.allOf) {
    nested.allOf = option.allOf.map(withMarkers);
  }
  return marker ? { ...nested, [marker]: true } : nested;
}

function mapOptions(config: ConfigSchema): ConfigSchema {
  const mapped: ConfigSchema = {};
  for (const [key, option] of Object.entries(config)) {
    mapped[key] = withMarkers(option);
  }
  return mapped;
}

/**
 * Icons the builder draws its own way: the DMS gives a table form the form's
 * pencil, and side by side in the palette the two read as one component.
 */
const ICONS = new Map([["ResourceForm", "i-ph-clipboard-text"]]);

function fromDeclared(declared: DeclaredBlockType): BlockTypeDescriptor {
  return {
    type: declared.type,
    import: { name: declared.type, module: BASE_MODULE },
    componentName: declared.componentName,
    label: declared.meta.name,
    icon: ICONS.get(declared.type) ?? declared.meta.icon,
    group: declared.meta.group,
    container: declared.container === true,
    allowedChildren: declared.allowedChildren,
    slots: declared.slots,
    dynamicSlots: declared.dynamicSlots,
    config: mapOptions(declared.config),
    defaults: declared.defaults,
    fixedOptions: declared.fixedOptions,
    childMeta: declared.childMeta ? mapOptions(declared.childMeta) : undefined,
    configOrigin: "annotated",
    description: declared.meta.description,
    controllerArg: declared.controllerArg,
    initialChildren: declared.initialChildren,
  };
}

/**
 * Declared block types win; inferred ones fill in for factories `dms-base` has
 * not declared yet.
 */
function mergeBlocks(
  declared: DeclaredBlockType[],
  inferred: BlockTypeDescriptor[],
): BlockTypeDescriptor[] {
  const blocks = declared.map(fromDeclared);
  const known = new Set(blocks.map((block) => block.type));
  return blocks.concat(inferred.filter((block) => !known.has(block.type)));
}

export function buildCatalog(): BlockCatalog {
  if (cached) {
    return cached;
  }
  cached = {
    blocks: mergeBlocks(loadDeclaredBlockTypes(), inferBlocks()),
    dataTypes: inferDataTypes(),
    reservedFieldNames: [...RESERVED_FIELD_NAMES],
    generatedAt: new Date().toISOString(),
  };
  return cached;
}

export function blockDescriptor(type: string): BlockTypeDescriptor | undefined {
  return buildCatalog().blocks.find((block) => block.type === type);
}

export function isControllerLeadingBlock(type: string): boolean {
  return blockDescriptor(type)?.controllerArg === true;
}

export function invalidateCatalog(): void {
  cached = undefined;
  invalidateInference();
}
