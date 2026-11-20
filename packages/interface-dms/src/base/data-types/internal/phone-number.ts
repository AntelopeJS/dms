import { InterfaceFunction } from "@antelopejs/interface-core";

/**
 * @internal The E.164 form ("+32494669443") of a phone number typed in any
 * common way ("0494 66 94 43", "+32 494...", "0032 494..."): a number without
 * a "+" or "00" prefix reads in `defaultCountry`. `undefined` when the text is
 * not a possible number of its country.
 */
export const ToE164 =
  InterfaceFunction<
    (text: string, defaultCountry?: string) => string | undefined
  >();
