import {
  type BlockTypeDescriptor,
  ValidateBlockOptions,
} from "@antelopejs/interface-dms/base/block-types";
import { z } from "zod";
import type { JsonObject, MockupIssue, MockupNode } from "./model";
import { jsonObjectSchema } from "./model";

/**
 * Turns the options a block's component receives back into the options its
 * factory takes, which is what `ValidateBlockOptions` checks. Most blocks
 * take the same; the adapters below cover those whose factory serializes its
 * input into another layout.
 */
type FactoryInputAdapter = (
  options: JsonObject,
  node: MockupNode,
  pointer: string,
  issues: MockupIssue[],
) => JsonObject;

const BLOCK_WIDGET = "block";
const SUPPLIED_BY_CHILD: JsonObject = {};

/**
 * An option holding a block (`ChartCard`'s `chart`) reaches the component as
 * the child of that id. The child is checked as its own node, so the option
 * only has to be present.
 */
function blockOptionsFromChildren(
  descriptor: BlockTypeDescriptor,
): FactoryInputAdapter {
  const blockOptions = Object.entries(descriptor.config)
    .filter(([, schema]) => schema.ui?.widget === BLOCK_WIDGET)
    .map(([key]) => key);
  return (options, node) => {
    const supplied = blockOptions.filter(
      (key) =>
        !Object.hasOwn(options, key) &&
        (node.children ?? []).some((child) => child.id === key),
    );
    if (!supplied.length) return options;
    return {
      ...options,
      ...Object.fromEntries(supplied.map((key) => [key, SUPPLIED_BY_CHILD])),
    };
  };
}

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

/**
 * A serialized form keeps every field in `fields` and lists each section's
 * by id (`fieldIds`), where the factory takes the fields inside the section.
 * The fields are checked once, in `fields`; each id must name one of them.
 */
const formSections: FactoryInputAdapter = (options, _node, pointer, issues) => {
  const sections = z.array(jsonObjectSchema).safeParse(options.sections);
  if (!sections.success) return options;
  const known = topLevelFieldIds(options);
  const adapted = sections.data.map((section, index) => {
    const serialized = serializedSectionSchema.safeParse(section);
    if (!serialized.success || Object.hasOwn(section, "fields")) return section;
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
};

/** Adapters keyed by the component a block emits. */
const COMPONENT_ADAPTERS = new Map<string, FactoryInputAdapter>([
  ["dms-form", formSections],
]);

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
  const componentAdapter = COMPONENT_ADAPTERS.get(descriptor.componentName);
  const adapters = [
    blockOptionsFromChildren(descriptor),
    ...(componentAdapter ? [componentAdapter] : []),
  ];
  const input = adapters.reduce(
    (current, adapt) => adapt(current, node, pointer, issues),
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
