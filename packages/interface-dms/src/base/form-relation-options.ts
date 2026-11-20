/** Options of the relation pickers `dms-input-relation` and `dms-input-cascader`. @packageDocumentation */
import type { ComponentInfoSerialized } from "../component";
import type { FormPropsSerialized } from "./form-types";
import type { FormContainerPageTexts } from "./table-view/options";

/**
 * Narrows a relation picker to the related rows matching another field of
 * the same form: the related table's `field` must equal the form's current
 * value of `from` (a ticket's site among its customer's sites).
 */
export interface RelationFilterBy {
  /**
   * Field of the related table to match. It must be filterable there
   * (`filterable: true` or `@Filter`): the search route honors only the
   * filters the related controller declares.
   */
  field: string;
  /** Id of the form field whose value the related `field` must equal. */
  from: string;
}

/**
 * A fixed condition on the related rows a relation picker lists, in the
 * related table's filter syntax (`filter_<field>=<mode>:<value>`), e.g.
 * `{ field: "archived", mode: "ne", value: "true" }` for its active rows.
 */
export interface RelationFilter {
  /**
   * Field of the related table to match. It must be filterable there
   * (`filterable: true` or `@Filter`): the search route honors only the
   * filters the related controller declares.
   */
  field: string;
  /** Compare mode of the field's filter, e.g. `"is"` or `"ne"`. */
  mode: string;
  /** Value compared, as the filter reads it from the URL. */
  value?: string;
}

export interface RelationOptions {
  placeholder?: string;
  searchUrl: string;
  /**
   * Lists only the related rows matching another field of the form. The
   * picker searches again when that field changes and clears a pick made
   * for its previous value. While it is empty, every row is offered.
   */
  filterBy?: RelationFilterBy;
  /**
   * Lists only the related rows meeting a fixed condition. A held value
   * outside it keeps its label. Ignored outside a form (a filter's picker).
   */
  filter?: RelationFilter;
  multiple?: boolean;
  deselectable?: boolean;
  keyMapping?: {
    label?: string;
    value?: string;
    avatar?: string;
    disabled?: string;
  };
  addForm?: ComponentInfoSerialized<FormPropsSerialized>;
  /**
   * The `add` permission of each TableView mounted on the related
   * controller: the inline add form posts to their shared `new` route, which
   * any one of them grants.
   */
  addPermissionIds?: string[];
  /**
   * Title and description of the drawer the "add" entry opens.
   * `$`-prefixed: i18n keys.
   */
  addFormTexts?: FormContainerPageTexts;
}

export interface CascaderRelationKeyMapping {
  label: string;
  value: string;
  parent: string;
  disabled?: string;
}

export interface CascaderRelationOptions {
  placeholder?: string;
  searchUrl: string;
  multiple?: boolean;
  deselectable?: boolean;
  keyMapping: CascaderRelationKeyMapping;
  maxDepth?: number;
  leafOnly?: boolean;
}
