import {
  type BlockOptionSchema,
  type BlockTypeDescriptor,
  ValidateBlockOptions,
} from "@antelopejs/interface-dms/base/block-types";
import { z } from "zod";
import type { JsonObject, MockupIssue, MockupNode } from "./model";
import { jsonObjectSchema } from "./model";

type OptionsDescription = Record<string, BlockOptionSchema>;

/**
 * Where the options a block's component receives, which a spec writes,
 * differ from the options its factory takes, which the registry describes
 * and `ValidateBlockOptions` checks. Most blocks take the same; each adapter
 * covers a factory that serializes its input into another layout, both ways:
 * back to the factory's input for validation, and over its description for
 * the JSON Schema.
 */
interface PreviewAdapter {
  applies(descriptor: BlockTypeDescriptor): boolean;
  toFactoryInput(
    descriptor: BlockTypeDescriptor,
    options: JsonObject,
    node: MockupNode,
    pointer: string,
    issues: MockupIssue[],
  ): JsonObject;
  describe(config: OptionsDescription): OptionsDescription;
}

const BLOCK_WIDGET = "block";
const SUPPLIED_BY_CHILD: JsonObject = {};

function blockOptionKeys(config: OptionsDescription): string[] {
  return Object.entries(config)
    .filter(([, option]) => option.ui?.widget === BLOCK_WIDGET)
    .map(([key]) => key);
}

/**
 * An option holding a block (`ChartCard`'s `chart`) reaches the component as
 * the child of that id. The child is checked as its own node, so the option
 * only has to be present.
 */
const blockChildren: PreviewAdapter = {
  applies: (descriptor) => blockOptionKeys(descriptor.config).length > 0,
  toFactoryInput(descriptor, options, node) {
    const supplied = blockOptionKeys(descriptor.config).filter(
      (key) =>
        !Object.hasOwn(options, key) &&
        (node.children ?? []).some((child) => child.id === key),
    );
    if (!supplied.length) return options;
    return {
      ...options,
      ...Object.fromEntries(supplied.map((key) => [key, SUPPLIED_BY_CHILD])),
    };
  },
  describe(config) {
    const children = new Set(blockOptionKeys(config));
    return Object.fromEntries(
      Object.entries(config).filter(([key]) => !children.has(key)),
    );
  },
};

const FORM_COMPONENT = "dms-form";
const serializedSectionSchema = z.object({ fieldIds: z.array(z.string()) });
const fieldIdSchema = z.object({ id: z.string() });

function topLevelFieldIds(options: JsonObject): Set<string> {
  const fields = z.array(z.unknown()).safeParse(options.fields);
  const ids = (fields.success ? fields.data : []).flatMap((field) => {
    const parsed = fieldIdSchema.safeParse(field);
    return parsed.success ? [parsed.data.id] : [];
  });
  return new Set(ids);
}

const FIELD_IDS: BlockOptionSchema = {
  type: "array",
  items: { type: "string" },
  description: "The ids of the fields in `fields` this section holds.",
};

/**
 * A serialized form keeps every field in `fields` and lists each section's
 * by id (`fieldIds`), where the factory takes the fields inside the section.
 * The fields are checked once, in `fields`; each id must name one of them.
 */
const formSections: PreviewAdapter = {
  applies: (descriptor) => descriptor.componentName === FORM_COMPONENT,
  toFactoryInput(_descriptor, options, _node, pointer, issues) {
    const sections = z.array(jsonObjectSchema).safeParse(options.sections);
    if (!sections.success) return options;
    const known = topLevelFieldIds(options);
    const adapted = sections.data.map((section, index) => {
      const serialized = serializedSectionSchema.safeParse(section);
      if (!serialized.success || Object.hasOwn(section, "fields")) {
        return section;
      }
      serialized.data.fieldIds.forEach((id, position) => {
        if (known.has(id)) return;
        issues.push({
          path: `${pointer}/sections/${index}/fieldIds/${position}`,
          message: `no field of the form has the id "${id}"`,
        });
      });
      return { ...section, fields: [] };
    });
    return { ...options, sections: adapted };
  },
  describe(config) {
    const sections = Object.hasOwn(config, "sections")
      ? config.sections
      : undefined;
    const section = sections?.items;
    if (!sections || !section?.properties) return config;
    const entries = Object.entries(section.properties).map(
      ([key, option]): [string, BlockOptionSchema] => [
        key,
        key === "fields" ? { ...option, optional: true } : option,
      ],
    );
    const properties = Object.fromEntries([
      ...entries,
      ["fieldIds", FIELD_IDS] satisfies [string, BlockOptionSchema],
    ]);
    return {
      ...config,
      sections: { ...sections, items: { ...section, properties } },
    };
  },
};

const PREVIEW_ADAPTERS: readonly PreviewAdapter[] = [
  blockChildren,
  formSections,
];

function adaptersOf(descriptor: BlockTypeDescriptor): PreviewAdapter[] {
  return PREVIEW_ADAPTERS.filter((adapter) => adapter.applies(descriptor));
}

/** The options a spec writes for a block, described for the JSON Schema. */
export function previewOptionsOf(
  descriptor: BlockTypeDescriptor,
): OptionsDescription {
  return adaptersOf(descriptor).reduce(
    (config, adapter) => adapter.describe(config),
    descriptor.config,
  );
}

function childIssue(
  descriptor: BlockTypeDescriptor,
  child: MockupNode,
  childType: string | undefined,
): string | undefined {
  if (descriptor.container) {
    const allowed = descriptor.allowedChildren;
    if (!allowed || (childType !== undefined && allowed.includes(childType))) {
      return undefined;
    }
    return `${descriptor.type} accepts only ${allowed.join(", ")} as children`;
  }
  const slots = blockOptionKeys(descriptor.config);
  if (child.id !== undefined && slots.includes(child.id)) return undefined;
  return slots.length
    ? `${descriptor.type} takes no children but the ${slots.join(", ")} block`
    : `${descriptor.type} takes no children`;
}

/**
 * Checks the children of a block node against its registered type: a
 * container's `allowedChildren`, and a block that is no container takes only
 * the children its block options name (`ChartCard`'s `chart`). `typeOf`
 * answers the registered type a child resolves to.
 */
export function validateBlockChildren(
  descriptor: BlockTypeDescriptor,
  node: MockupNode,
  pointer: string,
  issues: MockupIssue[],
  typeOf: (child: MockupNode) => string | undefined,
): void {
  (node.children ?? []).forEach((child, index) => {
    const message = childIssue(descriptor, child, typeOf(child));
    if (message) issues.push({ path: `${pointer}/children/${index}`, message });
  });
}

/**
 * Checks the options of a block node against its registered schema, each
 * issue at its pointer into the spec (`pointer` is the node's options).
 */
export function validateBlockOptions(
  descriptor: BlockTypeDescriptor,
  node: MockupNode,
  options: JsonObject,
  pointer: string,
  issues: MockupIssue[],
): void {
  const input = adaptersOf(descriptor).reduce(
    (current, adapter) =>
      adapter.toFactoryInput(descriptor, current, node, pointer, issues),
    options,
  );
  const result = ValidateBlockOptions(descriptor.type, input);
  if (result.valid) return;
  issues.push(
    ...result.issues.map((issue) => ({
      path: `${pointer}${issue.pointer}`,
      message: issue.message,
    })),
  );
}
