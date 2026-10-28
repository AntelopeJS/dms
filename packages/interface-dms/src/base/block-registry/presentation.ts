import type {
  BlockOptionSchema,
  BlockOptionUi,
  BlockTypeDescriptor,
} from "./types";

/** The hints needed to decide whether an editor offers an option in simple mode. */
export interface SimpleBlockOption {
  ui?: Pick<BlockOptionUi, "hidden" | "advanced" | "derivedFrom"> & {
    group?: string;
  };
}

/** Shared simple-mode policy; data binding remains available in the builder. */
export function IsSimpleBlockOption(option: SimpleBlockOption): boolean {
  const ui = option.ui;
  return (
    !ui?.hidden && !ui?.advanced && !ui?.derivedFrom && ui?.group !== "advanced"
  );
}

const PRESENTATION_WIDGETS = new Set([
  "text",
  "textarea",
  "number",
  "range",
  "switch",
  "select",
  "segmented",
  "icon",
  "color",
  "url",
]);

function isPresentation(option: BlockOptionSchema): boolean {
  return (
    IsSimpleBlockOption(option) &&
    option.ui?.group !== "data" &&
    !option.truncated &&
    (!option.ui?.widget || PRESENTATION_WIDGETS.has(option.ui.widget))
  );
}

function hasRestrictedHints(option: BlockOptionSchema): boolean {
  if (
    !IsSimpleBlockOption(option) ||
    option.ui?.group === "data" ||
    (option.ui?.widget && !PRESENTATION_WIDGETS.has(option.ui.widget))
  )
    return true;
  const children = [
    ...Object.values(option.properties ?? {}),
    ...[option.items, option.values, option.keys].filter(
      (child): child is BlockOptionSchema => !!child,
    ),
    ...(option.oneOf ?? []),
    ...(option.allOf ?? []),
    ...(option.prefixItems ?? []),
  ];
  return children.some(hasRestrictedHints);
}

function isScalar(option: BlockOptionSchema): boolean {
  if (option.truncated || option.allOf || option.prefixItems) return false;
  return (
    ["string", "number", "boolean"].includes(option.type) ||
    (option.type === "union" &&
      !!option.oneOf?.length &&
      option.oneOf.every(isScalar))
  );
}

function hasValueEditor(option: BlockOptionSchema): boolean {
  if (hasRestrictedHints(option)) return false;
  if (isScalar(option)) return true;
  if (option.type === "array") {
    return (
      ["appearance", "behavior", "layout", "features"].includes(
        option.ui?.group ?? "",
      ) &&
      !!option.items?.enum?.length &&
      isScalar(option.items)
    );
  }
  if (option.type === "record") {
    return (
      !!option.keys?.enum?.length && !!option.values && isScalar(option.values)
    );
  }
  return (
    option.type === "union" &&
    !!option.ui?.widget &&
    !!option.oneOf?.some(isScalar)
  );
}

/**
 * Dotted paths a standalone preview can edit without replacing data or opaque
 * values. Objects are descended into, never offered as JSON. Only enum arrays
 * in presentation/behavior groups and closed-key scalar records are editable
 * collections; rows, slots and other structural collections remain fixed.
 * Scalar unions have typed controls; a rich union with an explicit scalar
 * widget (e.g. translated text or chart color) offers that scalar only.
 *
 * Fixed factory options exclude their entire top-level subtree. The returned
 * paths reference `config`; consumers must not keep another copy of the schema.
 */
export function BlockPresentationPaths(
  descriptor: Pick<BlockTypeDescriptor, "config" | "fixedOptions">,
): string[] {
  const paths: string[] = [];
  const walk = (
    config: Record<string, BlockOptionSchema>,
    prefix: string,
  ): void => {
    for (const [key, option] of Object.entries(config)) {
      if (
        key.includes(".") ||
        ["__proto__", "constructor", "prototype"].includes(key)
      )
        continue;
      if (!prefix && Object.hasOwn(descriptor.fixedOptions ?? {}, key))
        continue;
      if (!isPresentation(option)) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      if (option.allOf || option.prefixItems) continue;
      if (option.type === "object" && option.properties) {
        walk(option.properties, path);
        continue;
      }
      if (hasValueEditor(option)) paths.push(path);
    }
  };
  walk(descriptor.config, "");
  return paths;
}
