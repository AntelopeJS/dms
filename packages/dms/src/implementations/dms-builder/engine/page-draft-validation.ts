import type {
  BlockDraft,
  BlockNode,
  BlockTypeDescriptor,
  ConfigValue,
  FieldAspect,
  OptionSchema,
  PageDraft,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import { blockDescriptor } from "./catalog";
import { isString } from "./scalar-guards";
import { isIdentifier } from "./paths";
import {
  buildResourceStructure,
  RESERVED_FIELD_NAMES,
} from "./resource-structure";
import { isPlainObject } from "./value";
import { issue, scanForExpr } from "./query-template";

/** Walk a config value alongside the schema that describes it, visiting each string in it. */
function walkOptions(
  schema: OptionSchema,
  value: ConfigValue,
  pointer: string,
  visit: (schema: OptionSchema, value: string, pointer: string) => void,
): void {
  if (isString(value)) {
    visit(schema, value, pointer);
  }
  if (schema.properties && isPlainObject(value)) {
    for (const [key, nested] of Object.entries(schema.properties)) {
      if (key in value) {
        walkOptions(nested, value[key], `${pointer}/${key}`, visit);
      }
    }
  }
  const items = schema.items;
  if (items && Array.isArray(value)) {
    value.forEach((entry, index) => {
      walkOptions(items, entry, `${pointer}/${index}`, visit);
    });
  }
  if (schema.values && isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      walkOptions(schema.values, entry, `${pointer}/${key}`, visit);
    }
  }
}

function checkFieldAspects(
  block: BlockDraft,
  descriptor: BlockTypeDescriptor,
  pointer: string,
): ValidationIssue[] {
  if (!block.controller) {
    return [];
  }
  const structure = buildResourceStructure(block.controller);
  if (!structure.ok) {
    return [];
  }
  const fields = structure.data.fields;
  const issues: ValidationIssue[] = [];
  const config = block.config ?? {};
  for (const [key, schema] of Object.entries(descriptor.config)) {
    if (!(key in config)) {
      continue;
    }
    walkOptions(
      schema,
      config[key],
      `${pointer}/config/${key}`,
      (node, value, at) => {
        const declared = node.ui?.fieldAspect;
        if (!declared) {
          return;
        }
        const aspects: FieldAspect[] = Array.isArray(declared)
          ? declared
          : [declared];
        if (RESERVED_FIELD_NAMES.has(value)) {
          return;
        }
        const field = fields.find((entry) => entry.name === value);
        if (!field) {
          issues.push(
            issue(
              at,
              `unknown field "${value}" on resource "${block.controller}"`,
            ),
          );
          return;
        }
        if (field.opaque) {
          return;
        }
        for (const aspect of aspects) {
          if (field[aspect] !== true) {
            issues.push(
              issue(
                at,
                `field "${value}" is not ${aspect}; the block would ignore this option`,
              ),
            );
          }
        }
      },
    );
  }
  return issues;
}

function validateBlock(
  block: BlockDraft,
  pointer: string,
  originals: Map<string, string>,
  path: string,
): ValidationIssue[] {
  const name = block.name;
  if (!isIdentifier(name)) {
    return [
      issue(`${pointer}/name`, `"${String(name)}" is not a valid identifier`),
    ];
  }
  if (block.preserve) {
    if (!originals.has(path)) {
      return [issue(pointer, `no block named "${name}" to preserve`)];
    }
    return [];
  }
  const descriptor = block.type ? blockDescriptor(block.type) : undefined;
  if (!descriptor) {
    return [issue(`${pointer}/type`, `unknown block type "${block.type}"`)];
  }
  return [
    ...validateController(block, descriptor.controllerArg === true, pointer),
    ...validateChildren(block, descriptor.container, pointer, originals, path),
    ...checkFieldAspects(block, descriptor, pointer),
  ];
}

function validateController(
  block: BlockDraft,
  controllerArg: boolean,
  pointer: string,
): ValidationIssue[] {
  if (controllerArg && !block.controller) {
    return [
      issue(
        `${pointer}/controller`,
        `block type "${block.type}" requires a controller`,
      ),
    ];
  }
  if (!controllerArg && block.controller) {
    return [
      issue(
        `${pointer}/controller`,
        `block type "${block.type}" does not take a controller`,
      ),
    ];
  }
  return [];
}

function validateChildren(
  block: BlockDraft,
  container: boolean,
  pointer: string,
  originals: Map<string, string>,
  path: string,
): ValidationIssue[] {
  const children = block.children ?? [];
  if (children.length === 0) {
    return [];
  }
  if (!container) {
    return [
      issue(`${pointer}/children`, `block type "${block.type}" takes no child`),
    ];
  }
  const allowed = blockDescriptor(block.type ?? "")?.allowedChildren;
  const issues = children.flatMap((child, index) => {
    const childPointer = `${pointer}/children/${index}`;
    const rejected =
      allowed && child.type && !allowed.includes(child.type)
        ? [
            issue(
              `${childPointer}/type`,
              `block type "${block.type}" only accepts ${allowed.join(", ")} as children`,
            ),
          ]
        : [];
    return [
      ...rejected,
      ...validateBlock(child, childPointer, originals, `${path}/${child.name}`),
    ];
  });
  return [...issues, ...duplicateNames(children, pointer)];
}

function duplicateNames(
  blocks: BlockDraft[],
  pointer: string,
): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const [index, block] of blocks.entries()) {
    if (seen.has(block.name)) {
      issues.push(
        issue(`${pointer}/${index}/name`, `duplicate name "${block.name}"`),
      );
    }
    seen.add(block.name);
  }
  return issues;
}

function checkSourcePreservation(
  block: BlockDraft,
  source: BlockNode,
  pointer: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fail = (message: string) => issues.push(issue(pointer, message));
  if (block.type && block.type !== source.type)
    fail("The identity of a source-preserved block cannot be changed");
  if (block.controller !== undefined && block.controller !== source.controller)
    fail("The controller is preserved in source code");
  if (block.preserve && block.config !== undefined)
    fail("A preserved block cannot accept configuration edits");
  if (block.children || source.lockedOptions) {
    const placement = (children: (BlockNode | BlockDraft)[]) =>
      children.map(({ name, slot, meta }) => ({ name, slot, meta }));
    if (
      JSON.stringify(placement(block.children ?? [])) !==
      JSON.stringify(placement(source.children ?? []))
    )
      fail("The children and their placement are preserved in source code");
  }
  for (const key of Object.keys(source.lockedOptions ?? {})) {
    if (Object.hasOwn(block.config ?? {}, key))
      fail(
        `Option "${key}" is locked and must be omitted; its original expression is retained by the server`,
      );
  }
  return issues;
}

export function validateDraft(
  draft: PageDraft,
  originals: Map<string, string>,
  nodes: Map<string, BlockNode>,
): ValidationIssue[] {
  function sourceConstraints(
    block: BlockDraft,
    path: string,
    pointer: string,
    inherited = false,
  ): ValidationIssue[] {
    const source = nodes.get(path);
    const issues: ValidationIssue[] = [
      ...scanForExpr(block.meta, "a page draft", `${pointer}/meta`),
      ...scanForExpr(block.config, "a page draft", `${pointer}/config`),
    ];
    const fail = (message: string) => issues.push(issue(pointer, message));
    if (block.lockedOptions && !source?.lockedOptions)
      fail(
        "No source-backed block at this path; blocks with locked options cannot be copied or reparented",
      );
    if (block.slot !== undefined && !isString(block.slot))
      fail("A slot must be a string");
    if (source && !source.editable && !block.preserve)
      fail("This block is locked; preserve it or edit its source code");
    if (inherited && !block.preserve)
      fail("Children of a preserved block are read-only");
    if (source && (block.preserve || source.lockedOptions)) {
      issues.push(...checkSourcePreservation(block, source, pointer));
    }
    return [
      ...issues,
      ...(block.children ?? []).flatMap((child, index) =>
        sourceConstraints(
          child,
          `${path}/${child.name}`,
          `${pointer}/children/${index}`,
          inherited || !!block.preserve,
        ),
      ),
    ];
  }
  return [
    ...scanForExpr(draft.page, "a page draft", "/page"),
    ...draft.blocks.flatMap((block, index) =>
      sourceConstraints(block, block.name, `/blocks/${index}`),
    ),
    ...draft.blocks.flatMap((block, index) =>
      validateBlock(block, `/blocks/${index}`, originals, block.name),
    ),
    ...duplicateNames(draft.blocks, "/blocks"),
  ];
}
