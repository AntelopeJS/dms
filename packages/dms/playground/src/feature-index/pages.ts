import type { PlaygroundFeature } from "./types";
import {
  PAGE_FEATURES,
  HEADER_FEATURES,
  NAVIGATION_FEATURES,
} from "./pages-structure";
import { ACCESS_FEATURES, CHROME_FEATURES } from "./pages-access";
import { SYSTEM_FEATURES } from "./pages-system";

export const PAGES_FEATURES: PlaygroundFeature[] = [
  ...PAGE_FEATURES,
  ...HEADER_FEATURES,
  ...NAVIGATION_FEATURES,
  ...ACCESS_FEATURES,
  ...CHROME_FEATURES,
  ...SYSTEM_FEATURES,
];
