import type { AccessMode } from "@antelopejs/interface-data-api/metadata";
import type { FormMode } from "./form-mode";

export interface ListableConfig {
  list?: boolean;
  select?: boolean;
  export?: boolean;
}

/**
 * Field metadata from DataAPIMeta
 */
export interface FieldMetadata {
  mandatory?: Set<FormMode>;
  mode?: AccessMode;
  /**
   * The access of one data-api action (`new`, `edit`, `get`, `list`) where it
   * differs from `mode`: `@Access(AccessMode.ReadWrite, { new: AccessMode.ReadOnly })`.
   */
  modeOverrides?: Record<string, AccessMode>;
  listable?: ListableConfig;
  sortable?: boolean;
}
