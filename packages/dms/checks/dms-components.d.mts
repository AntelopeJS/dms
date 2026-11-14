/** What {@link checkDmsComponents} reads. */
export interface DmsComponentsOptions {
  /** The frontend layer: the directory of its `package.json` and `dms.frontend.ts`. */
  layer: string;
  /** The module's TypeScript directories or files whose interface-dms builders name components, such as its backend `src`. */
  sources?: string[];
}

/**
 * Every name the installed `@antelopejs/dms` registers a component under, with its `Dms` prefix.
 *
 * @internal
 */
export declare function dmsComponentNames(): Set<string>;

/**
 * One diagnostic, `<file>:<line>: <name> ...`, for each `Dms` component the
 * layer's `.vue` files or the builders of `sources` name and that neither the
 * installed `@antelopejs/dms`, the installed `@antelopejs/dms-frontend` nor
 * the layer registers.
 */
export declare function checkDmsComponents(
  options: DmsComponentsOptions,
): Promise<string[]>;

/** Rejects with every diagnostic of {@link checkDmsComponents}, one per line. */
export declare function assertDmsComponents(
  options: DmsComponentsOptions,
): Promise<void>;
