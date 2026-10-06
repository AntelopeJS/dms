import { Logging } from "@antelopejs/interface-core/logging";
import type { ComponentFilterContext } from "../component";
import type {
  CustomButtonAvailability,
  CustomButtonSerialized,
} from "./types/custom-button";

/**
 * What a button served to one request carries of its availability.
 *
 * @internal
 */
export type AvailabilityFields = Pick<
  CustomButtonSerialized,
  "id" | "label" | "disabled" | "disabledReason"
>;

/**
 * A served button, disabled with its reason when its `availability` refuses
 * the request. A resolver that throws leaves the button enabled: the
 * operation behind it still refuses on its own, and failing the layout would
 * take the page down.
 *
 * @internal
 */
export async function applyButtonAvailability<T extends AvailabilityFields>(
  availability: CustomButtonAvailability | undefined,
  serialized: T,
  context: ComponentFilterContext,
): Promise<T> {
  if (!availability) return serialized;
  try {
    const unavailability = await availability(context);
    if (!unavailability) return serialized;
    return {
      ...serialized,
      disabled: true,
      disabledReason: unavailability.reason,
    };
  } catch (error) {
    Logging.Error(
      `[dms] availability of button "${serialized.id ?? serialized.label}" could not be resolved:`,
      error,
    );
    return serialized;
  }
}
