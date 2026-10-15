import { registerDefaultDataTypes } from "../build/composables/data-types/registerDefaults";
import { registerDefaultFunctions } from "../build/composables/table-view/registerDefaultFunctions";
import { registerFormFunctions } from "../build/composables/form/registerFormFunctions";
import { registerBlockFunctions } from "../build/composables/blocks/registerBlockFunctions";
import { registerPageReadsRefresh } from "../build/composables/blocks/refreshPageReads";

export default defineDmsPlugin(() => {
  registerDefaultDataTypes();
  registerDefaultFunctions();
  registerFormFunctions();
  registerBlockFunctions();
  registerPageReadsRefresh();
});
