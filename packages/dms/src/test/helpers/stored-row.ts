import {
  type Constructible,
  fromDatabase,
} from "@antelopejs/interface-database-decorators";

/**
 * The columns a stored row of `T` holds: every field the table class names,
 * its optional ones optional, without the methods its modifiers add.
 */
export type StoredRow<T> = {
  [
    K in keyof T as K extends string
      ? T[K] extends (...args: never[]) => void
        ? never
        : K
      : never
  ]: T[K];
};

/** An instance of `Table` read from `row`, as the database hands a row back. */
export function storedFixture<T extends Constructible>(
  Table: T,
  row: StoredRow<InstanceType<T>>,
): InstanceType<T> {
  return fromDatabase(row, Table);
}
