import type { MockupBlockType, MockupOptionSchema } from "./mockupCatalog";

/** The tabs of a block's inspector. */
export type MockupInspectorTab = "content" | "style";

/** The controls the inspector draws an option with: visual ones only. */
export const MOCKUP_INSPECTOR_CONTROLS = [
  "text",
  "textarea",
  "number",
  "range",
  "switch",
  "select",
  "segmented",
  "icon",
  "color",
] as const;

export type MockupInspectorControl = (typeof MOCKUP_INSPECTOR_CONTROLS)[number];

/** One option the inspector offers, and how. */
export interface MockupInspectorField {
  key: string;
  label: string;
  control: MockupInspectorControl;
  option: MockupOptionSchema;
  /** What the block shows while the option is unset: the factory's default. */
  fallback: unknown;
  /** The values a `select` or `segmented` control offers, with their labels. */
  choices: Array<{ value: string | number | boolean; label: string }>;
}

/**
 * Which option groups each tab shows. `data`, `behavior` and `advanced` are
 * never shown: data wiring is the AI's, at build time.
 */
const TAB_GROUPS: Record<MockupInspectorTab, readonly string[]> = {
  content: ["content"],
  style: ["appearance", "layout", "features"],
};

function controlOf(
  option: MockupOptionSchema,
): MockupInspectorControl | undefined {
  const widget = option.ui?.widget;
  if (widget !== undefined) {
    return MOCKUP_INSPECTOR_CONTROLS.find((control) => control === widget);
  }
  if (option.enum?.length) return "select";
  switch (option.type) {
    case "string":
      return "text";
    case "number":
      return "number";
    case "boolean":
      return "switch";
    default:
      return undefined;
  }
}

function choicesOf(
  option: MockupOptionSchema,
): MockupInspectorField["choices"] {
  const labels = option.ui?.valueLabels ?? {};
  return (option.enum ?? []).map((value) => {
    const name = String(value);
    return {
      value,
      label: Object.hasOwn(labels, name) ? (labels[name] ?? name) : name,
    };
  });
}

function isShown(option: MockupOptionSchema, tab: MockupInspectorTab): boolean {
  const group = option.ui?.group;
  return (
    group !== undefined &&
    TAB_GROUPS[tab].includes(group) &&
    !option.ui?.hidden &&
    !option.ui?.advanced
  );
}

/**
 * The options of `block` the inspector's `tab` offers: visual ones only, in
 * `ui.order`, then in declaration order. Nothing that wires data, behaviour
 * or permissions, and no widget that edits an address, a resource or JSON.
 */
export function inspectorFields(
  block: MockupBlockType,
  tab: MockupInspectorTab,
): MockupInspectorField[] {
  const fields = Object.entries(block.config).flatMap(([key, option]) => {
    const control = isShown(option, tab) ? controlOf(option) : undefined;
    if (!control) return [];
    const field: MockupInspectorField = {
      key,
      label: option.ui?.label ?? key,
      control,
      option,
      fallback: Object.hasOwn(block.defaults, key)
        ? block.defaults[key]
        : option.default,
      choices: choicesOf(option),
    };
    return [field];
  });
  const rank = (field: MockupInspectorField) =>
    field.option.ui?.order ?? Number.POSITIVE_INFINITY;
  return fields
    .map((field, index) => ({ field, index }))
    .sort((left, right) => {
      const byOrder = rank(left.field) - rank(right.field);
      return Number.isNaN(byOrder) || byOrder === 0
        ? left.index - right.index
        : byOrder;
    })
    .map(({ field }) => field);
}
