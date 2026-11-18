import type { MatrixColumn } from "../../../types/matrix";

/**
 * How a number of `column` reads in `locale`: as an amount in its
 * `currency` ("€65.00", "65,00 €") when it names one, else as a plain
 * number.
 */
export function numberFormatOf(
  locale: string,
  column?: Pick<MatrixColumn, "currency">,
): Intl.NumberFormat {
  return column?.currency
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currency: column.currency,
      })
    : new Intl.NumberFormat(locale);
}
