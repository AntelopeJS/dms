/** What {@link checkDmsComponents} reads. */
export interface DmsComponentsOptions {
  /** The frontend layer: the directory of its `package.json` and `dms.frontend.ts`. */
  layer: string;
  /** The module's TypeScript directories or files whose interface-dms builders name components, such as its backend `src`. */
  sources?: string[];
}

/**
 * The names the installed `@antelopejs/dms` registers: each component with its `Dms` prefix, and each layout.
 *
 * @internal
 */
export declare function dmsRegistrations(): {
  components: Set<string>;
  layouts: Set<string>;
};

/**
 * One diagnostic, `<file>:<line>: <name> ...`, for each `Dms` component the
 * layer names by tag, static `is` or `resolveComponent`, or that an
 * interface-dms builder of the layer or of `sources` names, and that neither
 * the installed `@antelopejs/dms`, the installed `@antelopejs/dms-frontend`
 * nor the layer registers.
 */
export declare function checkDmsComponents(
  options: DmsComponentsOptions,
): Promise<string[]>;

/** Rejects with every diagnostic of {@link checkDmsComponents}, one per line. */
export declare function assertDmsComponents(
  options: DmsComponentsOptions,
): Promise<void>;
