/** Stable built-in input adapters. @packageDocumentation */
import type { ComponentInfoSerialized } from "../../../component";
import { FormComponents } from "../../form-schema";

export type SelectDisplay =
  (typeof import("../default-types").SELECT_DISPLAYS)[number];

export type BooleanDisplay =
  (typeof import("../default-types").BOOLEAN_DISPLAYS)[number];

export const SINGLE_PICK_DISPLAYS = new Set<SelectDisplay>([
  "segmented",
  "radio",
]);

type SelectInputOptions = FormComponents.SelectOptions &
  Pick<FormComponents.ChoiceCardsOptions, "columns">;

function choiceCardsOptions({
  items,
  multiple,
  columns,
}: SelectInputOptions): FormComponents.ChoiceCardsOptions {
  const options: FormComponents.ChoiceCardsOptions = { items, multiple };
  if (columns !== undefined) options.columns = columns;
  return options;
}

export const SELECT_INPUTS: Record<
  SelectDisplay,
  (options: SelectInputOptions) => ComponentInfoSerialized
> = {
  dropdown: ({ columns: _columns, ...options }) =>
    FormComponents.InputSelect(options),
  cards: (options) =>
    FormComponents.InputChoiceCards(choiceCardsOptions(options)),
  segmented: ({ items }) => FormComponents.InputSegmentedSelect({ items }),
  radio: ({ items }) => FormComponents.InputRadioGroup({ items }),
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
