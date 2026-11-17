/** Stable built-in input adapters. @packageDocumentation */
import type { ComponentInfoSerialized } from "../../../component";
import { FormComponents } from "../../form-schema";
import {
  type ColumnReference,
  ITEMS_FROM_KEY,
  withColumnReference,
} from "../../internal/column-references";

export type SelectDisplay =
  (typeof import("../default-types").SELECT_DISPLAYS)[number];

export type BooleanDisplay =
  (typeof import("../default-types").BOOLEAN_DISPLAYS)[number];

export const SINGLE_PICK_DISPLAYS = new Set<SelectDisplay>([
  "segmented",
  "radio",
]);

type SelectInputOptions = FormComponents.SelectOptions &
  Pick<FormComponents.ChoiceCardsOptions, "columns"> & {
    itemsFrom?: ColumnReference;
  };

function choiceCardsOptions({
  items,
  multiple,
  columns,
  itemsFrom,
}: SelectInputOptions): FormComponents.ChoiceCardsOptions {
  const options: FormComponents.ChoiceCardsOptions = { items, multiple };
  if (columns !== undefined) options.columns = columns;
  return withColumnReference(options, ITEMS_FROM_KEY, itemsFrom);
}

export const SELECT_INPUTS: Record<
  SelectDisplay,
  (options: SelectInputOptions) => ComponentInfoSerialized
> = {
  dropdown: ({ columns: _columns, ...options }) =>
    FormComponents.InputSelect(options),
  cards: (options) =>
    FormComponents.InputChoiceCards(choiceCardsOptions(options)),
  segmented: ({ items, itemsFrom }) =>
    FormComponents.InputSegmentedSelect(
      withColumnReference({ items }, ITEMS_FROM_KEY, itemsFrom),
    ),
  radio: ({ items, itemsFrom }) =>
    FormComponents.InputRadioGroup(
      withColumnReference({ items }, ITEMS_FROM_KEY, itemsFrom),
    ),
};

type BooleanInputOptions = FormComponents.BooleanCardOptions;

export const BOOLEAN_INPUTS: Record<
  BooleanDisplay,
  (options: BooleanInputOptions) => ComponentInfoSerialized
> = {
  switch: ({ label, description }) =>
    FormComponents.InputSwitch({ label, description }),
  checkbox: ({ label, description }) =>
    FormComponents.InputCheckbox({ label, description }),
  card: (options) => FormComponents.InputBooleanCard(options),
};
