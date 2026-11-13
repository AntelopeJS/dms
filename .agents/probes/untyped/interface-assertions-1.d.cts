/** A zod schema, or a hand-made `_def` stand-in for one, which the battery feeds describeSchema on purpose. */
export interface SchemaLike {
  readonly _def: {
    readonly typeName?: string;
    readonly description?: string;
  };
}

/** What a describe function answers, as far as the probe reads it: JSON-shaped data. */
export type Observation =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly Observation[]
  | { readonly [key: string]: Observation };

/** A set of options for SelectType, one of which carries a value outside the declared contract. */
export interface ChoiceOptions {
  readonly multiple?: boolean;
  readonly items: readonly {
    readonly value: string | number | boolean;
    readonly label: string;
  }[];
}

export type ChoiceInput = string | number | readonly string[] | undefined;

export interface ChoiceType {
  getValidation(): { parse(input: ChoiceInput): Observation };
}

export type Describer = (schema: SchemaLike) => Observation;

export const describeSchema: Describer;
export const describeOptions: Describer;
export const rerunDescribeSchema: Describer;
export const rerunDescribeOptions: Describer;
export const selectTypeOf: (options: ChoiceOptions) => ChoiceType;
