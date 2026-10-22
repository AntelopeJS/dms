import { registerDefaultDataTypes } from "../build/composables/data-types/registerDefaults";
import { registerDefaultFunctions } from "../build/composables/table-view/registerDefaultFunctions";
import { registerFormFunctions } from "../build/composables/form/registerFormFunctions";
import { registerBlockFunctions } from "../build/composables/blocks/registerBlockFunctions";
import { trackPageArrivals } from "../build/composables/table-view/utils/pageArrival";

export default defineDmsPlugin(() => {
  registerDefaultDataTypes();
  registerDefaultFunctions();
  registerFormFunctions();
  registerBlockFunctions();
  trackPageArrivals();
});
