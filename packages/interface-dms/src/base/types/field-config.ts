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
  listable?: ListableConfig;
  sortable?: boolean;
}
