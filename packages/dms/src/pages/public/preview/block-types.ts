import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-types";

/**
 * What the block preview needs to know of one registered block type to draw
 * it as a page would: the component its factory emits, the options the
 * factory sets whatever the caller passes, and whether it needs a controller
 * class (a backend resource) to have anything to show.
 */
export interface PreviewBlockType {
  componentName: string;
  fixedOptions?: ReturnType<typeof ListBlockTypes>[number]["fixedOptions"];
  needsController?: boolean;
}

/** Every registered block type, keyed by its factory name, e.g. `KpiCard`. */
export type PreviewBlockTypes = Record<string, PreviewBlockType>;

/**
 * The preview's allowlist, read from the block registry on each call so a
 * module registering its own block types later is listed too.
 */
export function listPreviewBlockTypes(): PreviewBlockTypes {
  const entries = ListBlockTypes().map((descriptor) => {
    const entry: PreviewBlockType = {
      componentName: descriptor.componentName,
    };
    if (descriptor.fixedOptions) {
      entry.fixedOptions = { ...descriptor.fixedOptions };
    }
    if (descriptor.controllerArg) entry.needsController = true;
    return [descriptor.type, entry] as const;
  });
  return Object.fromEntries(entries);
}
