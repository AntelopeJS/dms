import type { FieldData } from "@antelopejs/interface-data-api/metadata";
import type { FormMode } from "./form-mode";

export interface ListableConfig {
  list?: boolean;
  select?: boolean;
  export?: boolean;
}

/**
 * Field metadata from DataAPIMeta: its access (`mode`, `modeOverrides`) is the
 * data API's own, read with `GetEffectiveMode`.
 */
export interface FieldMetadata extends Pick<
  FieldData,
  "mode" | "modeOverrides"
> {
  mandatory?: Set<FormMode>;
  listable?: ListableConfig;
  sortable?: boolean;
}
