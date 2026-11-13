import type { PlaygroundFeature } from "./types";
import { formOptions, sectionFeatures, fieldFeatures } from "./form-options";
import { typeFeatures, uploadFeatures } from "./form-types";
import {
  resourceAndWatchFeatures,
  confirmFeatures,
  customInputFeatures,
} from "./form-flows";

export const FORM_FEATURES: PlaygroundFeature[] = [
  ...formOptions,
  ...sectionFeatures,
  ...fieldFeatures,
  ...typeFeatures,
  ...uploadFeatures,
  ...resourceAndWatchFeatures,
  ...confirmFeatures,
  ...customInputFeatures,
];
