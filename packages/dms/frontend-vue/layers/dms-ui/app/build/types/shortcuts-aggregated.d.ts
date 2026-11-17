/**
 * Describes the frontend renderer's generated module, not a runtime file in
 * this layer. It aggregates the modules' `app/config/shortcuts-registry`
 * exports into the workspace's `shortcuts-aggregated.generated.ts`.
 */
declare module "#shortcuts-aggregated" {
  import type { ComponentShortcuts } from "#dms-ui/app/types/shortcuts";

  const aggregatedShortcuts: ComponentShortcuts[];
  export default aggregatedShortcuts;
}
