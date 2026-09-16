import { registerDefaultDataTypes } from "../build/composables/data-types/registerDefaults";
import { registerDefaultFunctions } from "../build/composables/table-view/registerDefaultFunctions";
import { registerFormFunctions } from "../build/composables/form/registerFormFunctions";

export default defineDmsPlugin(() => {
  registerDefaultDataTypes();
  registerDefaultFunctions();
  registerFormFunctions();
});
